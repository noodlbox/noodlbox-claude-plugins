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

// Bash search command patterns (module-level to avoid recreation)
const BASH_SEARCH_PATTERNS = [
  /(?:^|[|;&]\s*)(?:e|f)?grep\s+(?:-[a-zA-Z0-9]+\s+)*['"]?([^'"\s|;&]+)/,
  /(?:^|[|;&]\s*)rg\s+(?:-[a-zA-Z0-9]+\s+)*['"]?([^'"\s|;&]+)/,
  /(?:^|[|;&]\s*)ag\s+(?:-[a-zA-Z0-9]+\s+)*['"]?([^'"\s|;&]+)/,
  /(?:^|[|;&]\s*)ack\s+(?:-[a-zA-Z0-9]+\s+)*['"]?([^'"\s|;&]+)/,
  /find\s+[^\s]+\s+.*-i?name\s+['"]?([^'"\s]+)/,
];

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
 */
function extractQueryFromBash(command) {
  if (!command || typeof command !== 'string' || command.length > MAX_COMMAND_LENGTH) {
    return null;
  }

  for (const pattern of BASH_SEARCH_PATTERNS) {
    const match = command.match(pattern);
    if (match && match[1]) {
      const extracted = cleanRegexPattern(match[1]);
      if (extracted && extracted.length >= 3) {
        return extracted;
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
