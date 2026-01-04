/**
 * Noodlbox Shared Hook Utilities
 *
 * Common functions for semantic search augmentation across platforms.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parse: parseShell } = require('shell-quote');

const NOODL_PATH = process.env.NOODLBOX_CLI_PATH || 'noodl';
const SEARCH_TIMEOUT_MS = 5000;
const MAX_COMMAND_LENGTH = 1000;
const DEBUG = process.env.NOODLBOX_HOOK_DEBUG === 'true';

const CACHE_FILE = path.join(os.homedir(), '.noodlbox', 'cache', 'repositories.json');
const CACHE_TTL_MS = 600_000; // 10 minutes

// Search commands we intercept
const SEARCH_COMMANDS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'find']);

// Flags that take a value (next arg is not the pattern)
const FLAGS_WITH_VALUES = new Set([
  // grep
  '-e', '-f', '-m', '-A', '-B', '-C', '-D', '-d', '--include', '--exclude',
  '--exclude-dir', '--include-dir', '--label', '--line-buffered',
  // rg
  '-g', '--glob', '-t', '--type', '-T', '--type-not', '--max-count',
  '--max-depth', '--max-filesize', '-j', '--threads', '-M', '--max-columns',
  '--context-separator', '--field-context-separator', '--path-separator',
  '-r', '--replace', '--pre', '--pre-glob', '--engine',
  // find
  '-name', '-iname', '-path', '-ipath', '-regex', '-iregex',
  '-type', '-size', '-mtime', '-atime', '-ctime', '-user', '-group',
  '-perm', '-newer', '-exec', '-execdir', '-ok', '-okdir',
]);

function debug(...args) {
  if (DEBUG) {
    console.error('[noodlbox-hook]', ...args);
  }
}

/**
 * Read JSON input from stdin synchronously.
 * More reliable than async iteration for CLI hooks.
 */
function readInput() {
  try {
    const data = fs.readFileSync(0, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    debug('Failed to read stdin:', e.message);
    return {};
  }
}

/**
 * Clean regex metacharacters from a pattern to extract searchable text.
 */
function cleanRegexPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') return null;

  const cleaned = pattern
    .replace(/\*\*/g, '')
    .replace(/\*/g, ' ')
    .replace(/\\.|\[.*?\]|\(.*?\)|\{.*?\}/g, ' ')
    .replace(/[\^\$\.\|\?\+\*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || null;
}

/**
 * Check if cwd is in an indexed repository using local cache.
 *
 * Returns:
 * - RepoInfo object if cwd is in an indexed repo
 * - false if cwd is definitely NOT in an indexed repo
 * - null if unknown (cache missing/stale/error)
 */
function getIndexedRepoInfo(cwd) {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      debug('Cache file does not exist');
      return null;
    }

    const entry = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));

    if (Date.now() - entry.cached_at > CACHE_TTL_MS) {
      debug('Cache is stale');
      return null;
    }

    const cache = entry.data;
    if (!cache || !cache.repositories || !cache.path_index) {
      debug('Invalid cache format');
      return null;
    }

    // Exact match
    if (cache.path_index[cwd] !== undefined) {
      const repo = cache.repositories[cache.path_index[cwd]];
      if (repo) {
        debug('Found repo in cache (exact match):', { source_path: repo.source_path, indexed: repo.indexed });
        return repo.indexed ? {
          repository_id: repo.id,
          repository_name: repo.full_name,
          indexed: repo.indexed
        } : false;
      }
    }

    // Prefix match (cwd is inside a repo)
    for (const [sourcePath, idx] of Object.entries(cache.path_index)) {
      if (cwd.startsWith(sourcePath + '/')) {
        const repo = cache.repositories[idx];
        if (repo) {
          debug('Found repo in cache (prefix match):', { source_path: sourcePath, indexed: repo.indexed });
          return repo.indexed ? {
            repository_id: repo.id,
            repository_name: repo.full_name,
            indexed: repo.indexed
          } : false;
        }
      }
    }

    debug('cwd not in any cached repo');
    return false;
  } catch (e) {
    debug('Cache read error:', e.message);
    return null;
  }
}

/**
 * Extract search query from Glob tool input.
 * Returns null for patterns that don't benefit from semantic search.
 */
function extractQueryFromGlob(pattern) {
  if (!pattern || typeof pattern !== 'string') return null;

  // Skip pure file extension patterns
  if (/^(\*\*\/|\w+\/\*\*\/)*\*\.[a-z]+$/i.test(pattern)) {
    debug('Glob is pure extension pattern, skipping:', pattern);
    return null;
  }
  if (/^(\*\*\/|\w+\/\*\*\/)*\*\.\{[a-z,]+\}$/i.test(pattern)) {
    debug('Glob is extension group pattern, skipping:', pattern);
    return null;
  }

  const parts = pattern
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\{[^}]+\}/g, '')
    .split(/[\/.]/)
    .filter((p) => p && p.length > 1)
    .filter((p) => !p.startsWith('.'));

  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Extract search query from Grep tool input.
 */
function extractQueryFromGrep(pattern) {
  return cleanRegexPattern(pattern);
}

/**
 * Extract search pattern from shell commands (grep, rg, find, ag, ack).
 * Uses shell-quote for proper parsing instead of fragile regex.
 */
function extractQueryFromBash(command) {
  if (!command || typeof command !== 'string' || command.length > MAX_COMMAND_LENGTH) {
    return null;
  }

  try {
    const tokens = parseShell(command);

    // Find the base command (handle pipes, env vars, etc.)
    let cmdIndex = 0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      // Skip operators and find actual command
      if (typeof token === 'string' && !token.includes('=')) {
        cmdIndex = i;
        break;
      }
      // Skip shell-quote operator objects
      if (typeof token === 'object') continue;
    }

    const baseCmd = typeof tokens[cmdIndex] === 'string'
      ? path.basename(tokens[cmdIndex])
      : null;

    if (!baseCmd || !SEARCH_COMMANDS.has(baseCmd)) {
      return null;
    }

    debug('Detected search command:', baseCmd);

    // Extract pattern based on command type
    if (baseCmd === 'find') {
      return extractFindPattern(tokens, cmdIndex);
    } else {
      return extractGrepPattern(tokens, cmdIndex);
    }
  } catch (e) {
    debug('Shell parse error:', e.message);
    return null;
  }
}

/**
 * Extract pattern from grep/rg/ag/ack commands.
 * Pattern is typically the first non-flag, non-flag-value argument.
 */
function extractGrepPattern(tokens, startIndex) {
  let skipNext = false;

  for (let i = startIndex + 1; i < tokens.length; i++) {
    const token = tokens[i];

    // Skip non-string tokens (operators from shell-quote)
    if (typeof token !== 'string') continue;

    // Skip if previous was a flag that takes a value
    if (skipNext) {
      skipNext = false;
      continue;
    }

    // Check if this is a flag
    if (token.startsWith('-')) {
      // Check if it's a flag that takes a value
      if (FLAGS_WITH_VALUES.has(token)) {
        skipNext = true;
      }
      // Handle -e pattern (explicit pattern flag)
      if (token === '-e' && i + 1 < tokens.length) {
        const pattern = tokens[i + 1];
        if (typeof pattern === 'string') {
          const cleaned = cleanRegexPattern(pattern);
          if (cleaned && cleaned.length >= 3) {
            debug('Found -e pattern:', cleaned);
            return cleaned;
          }
        }
      }
      continue;
    }

    // First non-flag argument is the pattern
    const cleaned = cleanRegexPattern(token);
    if (cleaned && cleaned.length >= 3) {
      debug('Found grep pattern:', cleaned);
      return cleaned;
    }
  }

  return null;
}

/**
 * Extract pattern from find commands.
 * Look for -name, -iname, -path, -regex patterns.
 */
function extractFindPattern(tokens, startIndex) {
  const patternFlags = new Set(['-name', '-iname', '-path', '-ipath', '-regex', '-iregex']);

  for (let i = startIndex + 1; i < tokens.length; i++) {
    const token = tokens[i];

    if (typeof token !== 'string') continue;

    if (patternFlags.has(token) && i + 1 < tokens.length) {
      const pattern = tokens[i + 1];
      if (typeof pattern === 'string') {
        // For find, extract meaningful parts from glob patterns
        const cleaned = pattern
          .replace(/^\*+/, '')
          .replace(/\*+$/, '')
          .replace(/\*+/g, ' ')
          .replace(/\.[a-z]+$/i, '') // Remove file extensions
          .trim();

        if (cleaned && cleaned.length >= 3) {
          debug('Found find pattern:', cleaned);
          return cleaned;
        }
      }
    }
  }

  return null;
}

/**
 * Run noodlbox semantic search.
 *
 * Returns: { success: true, result, elapsed } or { success: false, notIndexed: bool }
 */
function runNoodlSearch(query, cwd) {
  try {
    const startTime = Date.now();
    let result = execFileSync(
      NOODL_PATH,
      ['search', query, cwd, '--include-content', '--limit', '10'],
      { encoding: 'utf-8', timeout: SEARCH_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const elapsed = Date.now() - startTime;

    // Shorten absolute paths to relative
    const cwdWithSlash = cwd.endsWith('/') ? cwd : cwd + '/';
    result = result.replaceAll(cwdWithSlash, './');

    debug('Search succeeded:', { resultLength: result.length, elapsedMs: elapsed });
    return { success: true, result, elapsed };
  } catch (error) {
    const stderr = error.stderr || '';
    const stdout = error.stdout || '';
    debug('Search failed:', stderr.slice(0, 200), stdout.slice(0, 200));

    const notIndexed = stderr.includes('not indexed') || stderr.includes('not found') ||
                       stdout.includes('not indexed') || stdout.includes('not found') ||
                       stdout.includes('No analyzed repository');

    return { success: false, notIndexed };
  }
}

/**
 * List available repositories.
 */
function listRepositories(timeout = 10000) {
  try {
    const result = execFileSync(
      NOODL_PATH,
      ['list'],
      { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return result.trim() || null;
  } catch {
    return null;
  }
}

module.exports = {
  debug,
  readInput,
  cleanRegexPattern,
  getIndexedRepoInfo,
  extractQueryFromGlob,
  extractQueryFromGrep,
  extractQueryFromBash,
  runNoodlSearch,
  listRepositories,
  NOODL_PATH,
};
