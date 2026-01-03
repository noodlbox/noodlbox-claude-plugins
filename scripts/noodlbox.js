#!/usr/bin/env node
/**
 * Noodlbox Claude Code Hooks
 *
 * Unified hook handler for Claude Code events:
 * 1. SessionStart - Lists available repositories on fresh session start
 * 2. PreToolUse (Glob/Grep/Bash) - Augments with semantic search
 */

const path = require('path');
const lib = require(path.join(__dirname, '../../../shared/hooks/lib.js'));

async function readInput() {
  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return JSON.parse(data);
}

/**
 * Extract search query from tool input
 */
function extractQueryFromTool(toolName, toolInput) {
  if (toolName === 'Glob') {
    return lib.extractQueryFromGlob(toolInput.pattern || '');
  } else if (toolName === 'Grep') {
    return lib.extractQueryFromGrep(toolInput.pattern || '');
  } else if (toolName === 'Bash') {
    return lib.extractQueryFromBash(toolInput.command || '');
  }
  return null;
}

/**
 * SessionStart handler - lists available repositories
 */
async function handleSessionStart(input) {
  const source = input.source || 'startup';

  lib.debug('SessionStart:', { source });

  // Only inject on fresh startup
  if (source !== 'startup') {
    lib.debug('Skipping - not a fresh startup');
    return;
  }

  // Trigger marketplace update in background
  try {
    const { spawn } = require('child_process');
    spawn('claude', ['plugin', 'marketplace', 'update', 'noodlbox'], {
      detached: true,
      stdio: 'ignore'
    }).unref();
    lib.debug('Triggered marketplace update in background');
  } catch {
    // Silently ignore
  }

  // List available repositories
  const repoList = lib.listRepositories();
  if (repoList) {
    console.log(`<noodlbox-repositories>\n${repoList}\n</noodlbox-repositories>`);
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
 * PreToolUse handler - intercepts Glob/Grep/Bash for semantic search
 */
async function handlePreToolUse(input) {
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const cwd = input.cwd || process.cwd();

  lib.debug('PreToolUse:', { toolName, toolInput, cwd });

  // Only intercept Glob/Grep/Bash
  if (toolName !== 'Glob' && toolName !== 'Grep' && toolName !== 'Bash') {
    lib.debug('Not a search tool, allowing');
    return;
  }

  const query = extractQueryFromTool(toolName, toolInput);
  lib.debug('Extracted query:', query);

  if (!query || query.length < 3) {
    lib.debug('No meaningful query, allowing builtin');
    return;
  }

  // Check cache first
  const repoInfo = lib.getIndexedRepoInfo(cwd);
  if (repoInfo === false) {
    lib.debug('Repo not indexed (from cache), allowing builtin');
    return;
  }

  // Run semantic search
  const searchResult = lib.runNoodlSearch(query, cwd);

  if (searchResult.success) {
    // Output Claude format
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        additionalContext: `Noodlbox semantic search for "${query}" (${searchResult.elapsed}ms):\n\n${searchResult.result}`
      }
    }));
  }
  // On failure, empty output = allow fallback
}

async function main() {
  const input = await readInput();
  const hookEvent = input.hook_event_name || '';

  if (hookEvent === 'SessionStart') {
    await handleSessionStart(input);
  } else if (hookEvent === 'PreToolUse') {
    await handlePreToolUse(input);
  }
}

main().catch(() => {
  // On any error, exit silently
});
