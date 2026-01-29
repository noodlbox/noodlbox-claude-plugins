#!/usr/bin/env node
/**
 * Noodlbox Claude Code Hooks
 *
 * Unified hook handler for Claude Code events:
 * 1. SessionStart - Lists available repositories on fresh session start
 * 2. PreToolUse (Glob/Grep/Bash) - Augments with semantic search
 * 3. PostToolUse (query_with_context) - Formats MCP results for humans
 */

const path = require('path');
const { execFileSync } = require('child_process');
const lib = require(path.join(__dirname, '../shared/hooks/lib.js'));

const SCHEMA_TIMEOUT_MS = 5000;

// ANSI colors for branding
const BRAND = '\x1b[38;5;39m[noodlbox]\x1b[0m'; // Blue

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
function handleSessionStart(input) {
  const source = input.source || 'startup';

  lib.debug('SessionStart:', { source });

  // Only inject on fresh startup
  if (source !== 'startup') {
    lib.debug('Skipping - not a fresh startup');
    return;
  }

  lib.debug('Initializing session...');

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
  let contextParts = [];

  if (repoList) {
    contextParts.push(`<noodlbox-repositories>\n${repoList}\n</noodlbox-repositories>`);
    lib.debug('Loaded indexed repositories');
  }

  // Run noodl schema to show database schema (static, same for all repos)
  try {
    lib.debug('Running noodl schema:', lib.NOODL_PATH);
    const schemaResult = execFileSync(
      lib.NOODL_PATH,
      ['schema'],
      { encoding: 'utf-8', timeout: SCHEMA_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    if (schemaResult && schemaResult.trim().length > 0) {
      contextParts.push(`<noodlbox-schema>\n${schemaResult.trim()}\n</noodlbox-schema>`);
    }
  } catch {
    // Silently ignore - schema not critical for startup
  }

  // Output with systemMessage for user visibility
  if (contextParts.length > 0) {
    console.log(JSON.stringify({
      systemMessage: `${BRAND} Session initialized with indexed repositories`,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: contextParts.join('\n\n')
      }
    }));
  }
}

/**
 * PreToolUse handler - intercepts Glob/Grep/Bash for semantic search
 * Only runs for indexed repos - exits immediately otherwise.
 */
function handlePreToolUse(input) {
  const cwd = input.cwd || process.cwd();

  // Check if repo is indexed FIRST - exit immediately if not
  const repoInfo = lib.getIndexedRepoInfo(cwd);
  if (repoInfo === false || repoInfo === null) {
    lib.debug('Repo not indexed, skipping');
    return;
  }

  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

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

  // Run semantic search
  lib.debug(`Semantic search: "${query}"`);
  const searchResult = lib.runNoodlSearch(query, cwd);

  if (searchResult.success) {
    lib.debug(`Found results in ${searchResult.elapsed}ms`);

    // Parse results for rich user message
    const searchInfo = lib.parseSearchResults(searchResult.result);
    const userMessage = lib.formatSearchMessage(query, searchInfo, searchResult.elapsed);

    // Output Claude format
    console.log(JSON.stringify({
      systemMessage: `\n${BRAND} ${userMessage}`,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        additionalContext: `Noodlbox search for "${query}":\n${searchResult.result}`
      }
    }));
  }
  // On failure, empty output = allow fallback
}

/**
 * PostToolUse handler - formats noodlbox MCP tool results for humans
 */
function handlePostToolUse(input) {
  const toolName = input.tool_name || '';
  const toolResponse = input.tool_response || '';

  lib.debug('PostToolUse:', { toolName });

  // Only handle noodlbox query_with_context (MCP tools: mcp__<server>__<tool>)
  if (!toolName.includes('query_with_context')) {
    return;
  }

  // tool_response can be string or object with result field
  let resultText;
  if (typeof toolResponse === 'string') {
    resultText = toolResponse;
  } else if (toolResponse.result) {
    resultText = typeof toolResponse.result === 'string'
      ? toolResponse.result
      : JSON.stringify(toolResponse.result);
  } else {
    resultText = JSON.stringify(toolResponse);
  }

  // Parse and format the result
  const searchInfo = lib.parseSearchResults(resultText);

  // Extract query from tool input if available
  const query = input.tool_input?.q || input.tool_input?.query || 'query';
  const userMessage = lib.formatSearchMessage(query, searchInfo, 0);

  // Output formatted results if we have entry points
  if (searchInfo.entryPoints && searchInfo.entryPoints.size > 0) {
    console.log(JSON.stringify({
      systemMessage: `\n${BRAND} ${userMessage}`,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `Noodlbox search for "${query}":\n${userMessage}`
      }
    }));
  }
}

function main() {
  try {
    const input = lib.readInput();
    const hookEvent = input.hook_event_name || '';

    if (hookEvent === 'SessionStart') {
      handleSessionStart(input);
    } else if (hookEvent === 'PreToolUse') {
      handlePreToolUse(input);
    } else if (hookEvent === 'PostToolUse') {
      handlePostToolUse(input);
    }
  } catch (e) {
    lib.debug('Hook error:', e.message);
    // Exit silently on any error
  }
}

main();
