#!/usr/bin/env node
/**
 * Noodlbox Claude Code Hooks
 *
 * Unified hook handler for multiple Claude Code events:
 *
 * 1. SessionStart - Injects architecture context on fresh session start
 * 2. PreToolUse (Glob/Grep/Bash) - Uses semantic search when repo is indexed
 *
 * Configuration in .claude/settings.json:
 * {
 *   "hooks": {
 *     "SessionStart": [{
 *       "hooks": [{ "type": "command", "command": "node /path/to/noodlbox.js" }]
 *     }],
 *     "PreToolUse": [{
 *       "matcher": "Glob|Grep|Bash",
 *       "hooks": [{ "type": "command", "command": "node /path/to/noodlbox.js" }]
 *     }]
 *   }
 * }
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Configuration
const NOODL_PATH = process.env.NOODLBOX_CLI_PATH || 'noodl';
const SEARCH_TIMEOUT_MS = 5000; // 5s max for search
const SESSION_TIMEOUT_MS = 10000;
const MAX_COMMAND_LENGTH = 1000; // ReDoS protection
const DEBUG = process.env.NOODLBOX_HOOK_DEBUG === 'true';

// Cache configuration (matches Rust CacheService)
const CACHE_FILE = path.join(os.homedir(), '.noodlbox', 'cache', 'repositories.json');
const CACHE_TTL_MS = 600_000; // 10 minutes in milliseconds

function debug(...args) {
  if (DEBUG) {
    console.error('[noodlbox-hook]', ...args);
  }
}

/**
 * Check if cwd is in an indexed repository using local cache.
 *
 * Cache format (CacheEntry<RepositoryCache>):
 * {
 *   "data": {
 *     "repositories": [{ "id", "name", "full_name", "source_path", "indexed" }],
 *     "path_index": { "/path/to/repo": 0 },
 *     "id_index": { "repo-id": 0 }
 *   },
 *   "cached_at": 1234567890000
 * }
 *
 * Returns:
 * - RepoInfo object if cwd is in an indexed repo
 * - false if cwd is definitely NOT in an indexed repo
 * - null if unknown (cache missing/stale/error) - should fallback to noodl search
 */
function getIndexedRepoInfo(cwd) {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      debug('Cache file does not exist');
      return null;
    }

    const entry = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));

    // Check cache freshness (cached_at is in milliseconds)
    if (Date.now() - entry.cached_at > CACHE_TTL_MS) {
      debug('Cache is stale');
      return null;
    }

    const cache = entry.data;
    if (!cache || !cache.repositories || !cache.path_index) {
      debug('Invalid cache format');
      return null;
    }

    // Try exact match in path_index first (fast path)
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

    // Try prefix match (cwd is inside a repo)
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

    // Not in any known repo = definitely not indexed
    debug('cwd not in any cached repo');
    return false;
  } catch (e) {
    debug('Cache read error:', e.message);
    return null; // Error = unknown, fallback to noodl search
  }
}

/**
 * Detect repository name in owner/repo format from git remote
 * Falls back to just the folder name if git remote not available
 */
function detectRepositoryName(cwd) {
  try {
    // Try to get owner/repo from git remote origin
    const remoteUrl = execFileSync(
      'git', ['remote', 'get-url', 'origin'],
      { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    // Parse owner/repo from various URL formats:
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    // ssh://git@github.com/owner/repo.git
    const match = remoteUrl.match(/[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (match) {
      return `${match[1]}/${match[2]}`;
    }
  } catch {
    // Git not available or no remote
  }

  // Fallback: just use folder name
  return path.basename(cwd);
}

async function readInput() {
  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return JSON.parse(data);
}

/**
 * SessionStart handler - lists available repositories
 */
async function handleSessionStart(input) {
  const source = input.source || 'startup';

  debug('SessionStart:', { source });

  // Only inject on fresh startup, not resume/clear/compact
  if (source !== 'startup') {
    debug('Skipping - not a fresh startup');
    return;
  }

  // Trigger marketplace update in background (non-blocking auto-update workaround)
  try {
    const { spawn } = require('child_process');
    spawn('claude', ['plugin', 'marketplace', 'update', 'noodlbox'], {
      detached: true,
      stdio: 'ignore'
    }).unref();
    debug('Triggered marketplace update in background');
  } catch {
    // Silently ignore - claude CLI might not be in PATH
  }

  // Run noodl list to show available repositories
  try {
    debug('Running noodl list:', NOODL_PATH);
    const result = execFileSync(
      NOODL_PATH,
      ['list'],
      { encoding: 'utf-8', timeout: SESSION_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    if (result && result.trim().length > 0) {
      console.log(`<noodlbox-repositories>
${result.trim()}
</noodlbox-repositories>`);
    }
  } catch {
    // Silently exit - noodl not available or not authenticated
  }

  // Run noodl schema to show database schema (static, same for all repos)
  try {
    debug('Running noodl schema:', NOODL_PATH);
    const schemaResult = execFileSync(
      NOODL_PATH,
      ['schema'],
      { encoding: 'utf-8', timeout: SESSION_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    if (schemaResult && schemaResult.trim().length > 0) {
      console.log(`<noodlbox-schema>
${schemaResult.trim()}
</noodlbox-schema>`);
    }
  } catch {
    // Silently ignore - schema not critical for startup
  }
}

/**
 * Extract search query from tool input
 * Returns null for patterns that don't benefit from semantic search
 */
function extractQueryFromTool(toolName, toolInput) {
  if (toolName === 'Glob') {
    const pattern = toolInput.pattern || '';

    // Skip pure file extension patterns - these just list files by type
    // Examples: **/*.py, *.js, **/*.{ts,tsx}, src/**/*.py
    if (/^(\*\*\/|\w+\/\*\*\/)*\*\.[a-z]+$/i.test(pattern)) {
      debug('Glob is pure extension pattern, skipping:', pattern);
      return null;
    }
    if (/^(\*\*\/|\w+\/\*\*\/)*\*\.\{[a-z,]+\}$/i.test(pattern)) {
      debug('Glob is extension group pattern, skipping:', pattern);
      return null;
    }

    // Extract meaningful parts from pattern
    const parts = pattern
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/\{[^}]+\}/g, '') // Remove brace expansions
      .split(/[\/.]/)
      .filter((p) => p && p.length > 1)
      .filter((p) => !p.startsWith('.'));

    return parts.length > 0 ? parts.join(' ') : null;

  } else if (toolName === 'Grep') {
    return (toolInput.pattern || '')
      .replace(/\\.|\[.*?\]|\(.*?\)|\{.*?\}/g, ' ')
      .replace(/[\^\$\.\|\?\+\*\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || null;

  } else if (toolName === 'Bash') {
    return extractQueryFromBashCommand(toolInput.command || '');
  }
  return null;
}

/**
 * Extract search pattern from bash commands (grep, rg, find, ag, ack)
 * Returns null if the command is not a search command
 */
function extractQueryFromBashCommand(command) {
  // ReDoS protection - limit input length
  if (!command || command.length > MAX_COMMAND_LENGTH) {
    return null;
  }

  // Match common search tools at the start of command or after pipe/&&/;
  const searchPatterns = [
    // grep/egrep/fgrep: grep [options] PATTERN
    /(?:^|[|;&]\s*)(?:e|f)?grep\s+(?:-[a-zA-Z0-9]+\s+)*['"]?([^'"\s|;&]+)/,
    // rg (ripgrep): rg [options] PATTERN
    /(?:^|[|;&]\s*)rg\s+(?:-[a-zA-Z0-9]+\s+)*['"]?([^'"\s|;&]+)/,
    // ag (silver searcher): ag [options] PATTERN
    /(?:^|[|;&]\s*)ag\s+(?:-[a-zA-Z0-9]+\s+)*['"]?([^'"\s|;&]+)/,
    // ack: ack [options] PATTERN
    /(?:^|[|;&]\s*)ack\s+(?:-[a-zA-Z0-9]+\s+)*['"]?([^'"\s|;&]+)/,
    // find with -name: find . -name "PATTERN"
    /find\s+[^\s]+\s+.*-name\s+['"]?([^'"\s]+)/,
    // find with -iname: find . -iname "PATTERN"
    /find\s+[^\s]+\s+.*-iname\s+['"]?([^'"\s]+)/,
  ];

  for (const pattern of searchPatterns) {
    const match = command.match(pattern);
    if (match && match[1]) {
      // Clean up the extracted pattern
      const extracted = match[1]
        .replace(/\*\*/g, '')
        .replace(/\*/g, ' ')
        .replace(/\\.|\[.*?\]|\(.*?\)|\{.*?\}/g, ' ')
        .replace(/[\^\$\.\|\?\+\*\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (extracted.length >= 3) {
        return extracted;
      }
    }
  }
  return null;
}

/**
 * PreToolUse handler - intercepts Glob/Grep/Bash for semantic search
 */
async function handlePreToolUse(input) {
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const cwd = input.cwd || process.cwd();

  debug('PreToolUse:', { toolName, toolInput, cwd });

  // Only intercept Glob/Grep/Bash
  if (toolName !== 'Glob' && toolName !== 'Grep' && toolName !== 'Bash') {
    debug('Not a search tool, allowing');
    // Empty output = allow (don't output anything for non-intercepted tools)
    return;
  }

  const query = extractQueryFromTool(toolName, toolInput);
  debug('Extracted query:', query);

  // Skip if no meaningful query (also handles non-search Bash commands)
  if (!query || query.length < 3) {
    debug('No meaningful query, allowing builtin');
    // Empty output = allow
    return;
  }

  // Check cache first - skip noodl search entirely if repo is not indexed
  const repoInfo = getIndexedRepoInfo(cwd);
  if (repoInfo === false) {
    // Definitely not indexed - skip noodl search entirely (~1ms vs ~600ms)
    debug('Repo not indexed (from cache), allowing builtin');
    return;
  }
  // repoInfo is null (unknown) or truthy (indexed) - proceed with noodl search

  try {
    debug('Running noodl search:', { query, cwd });
    const startTime = Date.now();
    let result = execFileSync(
      NOODL_PATH,
      ['search', query, cwd, '--include-content', '--limit', '10'],
      { encoding: 'utf-8', timeout: SEARCH_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const elapsed = Date.now() - startTime;

    // Shorten absolute paths to relative paths from cwd
    const cwdWithSlash = cwd.endsWith('/') ? cwd : cwd + '/';
    result = result.replaceAll(cwdWithSlash, './');

    debug('Search succeeded:', { resultLength: result.length, elapsedMs: elapsed });
    // Success - return semantic search results AND allow original tool to run
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        additionalContext: `Noodlbox semantic search for "${query}" (${elapsed}ms):\n\n${result}`
      }
    }));
  } catch (error) {
    const stderr = error.stderr || '';
    const stdout = error.stdout || '';
    debug('Search failed:', stderr.slice(0, 200), stdout.slice(0, 200));

    // If repo not indexed or not found, allow builtin tool (check both stderr and stdout)
    if (stderr.includes('not indexed') || stderr.includes('not found') ||
        stdout.includes('not indexed') || stdout.includes('not found') ||
        stdout.includes('No analyzed repository')) {
      debug('Repo not indexed, allowing builtin');
      // Empty output = allow
      return;
    }

    // Other errors - allow fallback to builtin
    debug('Unknown error, allowing builtin');
    // Empty output = allow
  }
}

async function main() {
  const input = await readInput();
  const hookEvent = input.hook_event_name || '';

  if (hookEvent === 'SessionStart') {
    await handleSessionStart(input);
  } else if (hookEvent === 'PreToolUse') {
    await handlePreToolUse(input);
  }
  // Unknown hooks or non-PreToolUse events: empty output = allow
}

main().catch(() => {
  // On any error, exit silently (empty output = allow for PreToolUse)
});
