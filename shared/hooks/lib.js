/**
 * Noodlbox Shared Hook Utilities
 *
 * Common functions for semantic search augmentation across platforms.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const NOODL_PATH = process.env.NOODLBOX_CLI_PATH || 'noodl';
const SEARCH_TIMEOUT_MS = 5000;
const MAX_COMMAND_LENGTH = 1000;
const DEBUG = process.env.NOODLBOX_HOOK_DEBUG === 'true';

const CACHE_FILE = path.join(os.homedir(), '.noodlbox', 'cache', 'repositories.json');
const CACHE_TTL_MS = 600_000; // 10 minutes

// Search commands we intercept
const SEARCH_COMMANDS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'find']);

// Flags that take a value (next arg is not the pattern) - per command
const GREP_FLAGS_WITH_VALUES = new Set([
  '-e', '-f', '-m', '-A', '-B', '-C', '-D', '-d', '--include', '--exclude',
  '--exclude-dir', '--include-dir', '--label',
]);

const RG_FLAGS_WITH_VALUES = new Set([
  '-e', '-f', '-m', '-A', '-B', '-C',
  '-g', '--glob', '-t', '--type', '-T', '--type-not', '--max-count',
  '--max-depth', '--max-filesize', '-j', '--threads', '-M', '--max-columns',
  '--context-separator', '--field-context-separator', '--path-separator',
  '-r', '--replace', '--pre', '--pre-glob', '--engine',
]);

const AG_ACK_FLAGS_WITH_VALUES = new Set([
  '-A', '-B', '-C', '-G', '--ignore-dir', '-g',
]);

function debug(...args) {
  if (DEBUG) {
    console.error('[noodlbox-hook]', ...args);
  }
}

/**
 * Simple shell command tokenizer.
 * Handles single/double quotes and basic escaping.
 * No external dependencies.
 */
function tokenize(command) {
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (let i = 0; i < command.length; i++) {
    const c = command[i];

    if (escape) {
      current += c;
      escape = false;
      continue;
    }

    if (c === '\\' && !inSingle) {
      escape = true;
      continue;
    }

    if (c === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (c === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (!inSingle && !inDouble && /\s/.test(c)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += c;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
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
 * Uses simple tokenizer for proper parsing without external dependencies.
 */
function extractQueryFromBash(command) {
  if (!command || typeof command !== 'string' || command.length > MAX_COMMAND_LENGTH) {
    return null;
  }

  try {
    const tokens = tokenize(command);
    if (tokens.length === 0) return null;

    // Find the base command (skip env vars like VAR=value)
    let cmdIndex = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (!tokens[i].includes('=')) {
        cmdIndex = i;
        break;
      }
    }

    const baseCmd = path.basename(tokens[cmdIndex]);

    if (!SEARCH_COMMANDS.has(baseCmd)) {
      return null;
    }

    debug('Detected search command:', baseCmd);

    // Extract pattern based on command type
    if (baseCmd === 'find') {
      return extractFindPattern(tokens, cmdIndex);
    } else {
      return extractGrepPattern(tokens, cmdIndex, baseCmd);
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
function extractGrepPattern(tokens, startIndex, cmd) {
  // Select appropriate flag set based on command
  let flagsWithValues;
  if (cmd === 'rg') {
    flagsWithValues = RG_FLAGS_WITH_VALUES;
  } else if (cmd === 'ag' || cmd === 'ack') {
    flagsWithValues = AG_ACK_FLAGS_WITH_VALUES;
  } else {
    flagsWithValues = GREP_FLAGS_WITH_VALUES;
  }

  let skipNext = false;

  for (let i = startIndex + 1; i < tokens.length; i++) {
    const token = tokens[i];

    // Skip if previous was a flag that takes a value
    if (skipNext) {
      skipNext = false;
      continue;
    }

    // Check if this is a flag
    if (token.startsWith('-')) {
      // Check if it's a flag that takes a value
      if (flagsWithValues.has(token)) {
        skipNext = true;
      }
      // Handle -e pattern (explicit pattern flag)
      if (token === '-e' && i + 1 < tokens.length) {
        const cleaned = cleanRegexPattern(tokens[i + 1]);
        if (cleaned && cleaned.length >= 3) {
          debug('Found -e pattern:', cleaned);
          return cleaned;
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

    if (patternFlags.has(token) && i + 1 < tokens.length) {
      const pattern = tokens[i + 1];
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
