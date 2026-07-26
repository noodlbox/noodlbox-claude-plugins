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
const fs = require('fs');
const { execFileSync } = require('child_process');
const lib = require(path.join(__dirname, '../shared/hooks/lib.js'));

const SCHEMA_TIMEOUT_MS = 5000;

// Path to AGENTS.md content (shared across all platforms)
const AGENTS_MD_PATH = path.join(__dirname, '../shared/skills/nbx-setup/references/AGENTS.md');

/**
 * Load AGENTS.md content, stripping YAML frontmatter
 */
function loadAgentsMdContent() {
  try {
    const content = fs.readFileSync(AGENTS_MD_PATH, 'utf-8');
    // Strip YAML frontmatter (everything between --- markers at start)
    const stripped = content.replace(/^---[\s\S]*?---\n*/m, '');
    return stripped.trim();
  } catch {
    return null;
  }
}

// ANSI colors for branding
const BRAND = '\x1b[38;5;39m[noodlbox]\x1b[0m'; // Blue

/**
 * Run the verify digest and inject it as PreToolUse context when it has
 * anything to deliver. Shared by the commit-boundary audit and the
 * mid-edit nudge — one guard, one envelope. Never blocks the tool
 * (machine contract: empty stdout ⇔ nothing to deliver; the all-clear
 * reassurance goes to the CLI's stderr, so no sentinel string-matching
 * happens here).
 */
function injectVerifyDigest(cwd, sessionId, channel, prefix) {
  const audit = lib.runNoodlVerifyDigest(cwd, sessionId, channel);
  if (!audit.success || !audit.result.trim()) {
    return;
  }
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      additionalContext: prefix + audit.result
    }
  }));
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
 * SessionStart handler - injects Noodlbox context and lists available repositories
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

  let contextParts = [];

  // Load AGENTS.md content (core Noodlbox documentation)
  const agentsMd = loadAgentsMdContent();
  if (agentsMd) {
    contextParts.push(`<noodlbox-context>\n${agentsMd}\n</noodlbox-context>`);
    lib.debug('Loaded Noodlbox context from AGENTS.md');
  }

  // List available repositories
  const repoList = lib.listRepositories();
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
      systemMessage: `${BRAND} Session initialized`,
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

  // Edit/Write prospectus auto-injection REMOVED (2026-07-19, Project 80
  // agent-channel trim): three sealed probes (Live8 0/4 acknowledgment,
  // Live3 0/3 completion, June packet_verify f2p fractions) showed
  // map-grade content delivered to agents steers nothing and habituates.
  // The map stays on demand (`noodl prospectus`) and in the UI; the
  // commit-boundary strict audit below is the agent channel.
  // (2026-07-24, delivery-rebuild P3: Edit/Write carries a STRICT
  // findings-only mid-edit nudge below — same proof tier as the commit
  // audit, throttled + repeat-suppressed. That is NOT the map-grade
  // injection this note removed; the removal stands.)

  // Bash `git commit`: deliver the verify digest ONCE at the commit
  // boundary (Project 74 moment 4, agent-side) — the strict structural
  // audit of the working tree, staleness-loud, findings-first. Never
  // blocks the tool; a clean "no findings" digest injects nothing.
  if (toolName === 'Bash' && lib.isCommitCommand(toolInput.command || '')) {
    // Session dedup lives in the CLI at FINDING grain (delivery-rebuild
    // P1): `noodl verify --session-id` suppresses already-delivered
    // findings itself, so an unchanged report renders an empty digest
    // and injectVerifyDigest's empty-stdout guard returns.
    injectVerifyDigest(
      cwd,
      input.session_id,
      undefined,
      'Noodlbox commit audit (structural findings on the changes you are about to commit):\n'
    );
    return;
  }

  // Edit/Write: the MID-EDIT nudge (delivery-rebuild P3) — the same
  // strict findings the commit audit delivers, but at the moment the
  // agent is still editing, so an incomplete propagation surfaces while
  // the task is open instead of at the commit boundary. Once per NEW
  // obligation, never per save: the CLI suppresses repeats per finding
  // per session (P1) and renders findings-only (no banners — wall W5);
  // midEditDue throttles the RUN cost. Never blocks the tool.
  if (toolName === 'Edit' || toolName === 'Write') {
    if (!lib.midEditDue(input.session_id)) {
      return;
    }
    injectVerifyDigest(
      cwd,
      input.session_id,
      'mid-edit',
      'Noodlbox mid-edit audit (structural findings on your working tree so far):\n'
    );
    return;
  }

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
 * PostToolUse handler - formats legacy query_with_context results for humans
 */
/**
 * True only when the tool response POSITIVELY reports failure. The
 * PostToolUse `tool_response` shape varies by host version; this reads
 * the documented fields when present (`exit_code`/`exitCode`,
 * `interrupted`) and FAILS OPEN on absence — a commit we cannot grade
 * still gets its cheap incremental re-analyze rather than risking a
 * stale baseline.
 */
function commitVisiblyFailed(toolResponse) {
  if (!toolResponse || typeof toolResponse !== 'object') return false;
  if (toolResponse.interrupted === true) return true;
  const code = toolResponse.exit_code ?? toolResponse.exitCode;
  return typeof code === 'number' && code !== 0;
}

function handlePostToolUse(input) {
  const toolName = input.tool_name || '';
  const toolResponse = input.tool_response || '';

  lib.debug('PostToolUse:', { toolName });

  // Bash `git commit` succeeded: refresh the committed baseline in the
  // background (E3 ship requirement 2 — daemonless watcher emulation).
  // The commit moved HEAD past the analyzed graph; without a re-analyze
  // every later digest in this session is the stale banner (the defect
  // that voided the first loop-probe fleet). Debounced per repo,
  // detached, never blocks the hook. Gated on an indexed noodlbox box
  // (same guard as PreToolUse — the plugin is installed globally and
  // must not act in unrelated repos) and on the command not visibly
  // failing: claiming the debounce window on a REJECTED commit
  // (pre-commit hook, nothing-to-commit) would skip the re-analyze for
  // the real commit that follows within the window.
  const cwd = input.cwd || process.cwd();
  if (toolName === 'Bash' && lib.isCommitCommand(input.tool_input?.command || '')) {
    const failed = commitVisiblyFailed(input.tool_response);
    if (!failed && lib.getIndexedRepoInfo(cwd) && lib.postCommitAnalyzeDue(cwd)) {
      lib.spawnPostCommitAnalyze(cwd);
    }
    return;
  }

  // Only handle legacy query_with_context tool results.
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

  // Output formatted results if we have any content
  const hasContent = (searchInfo.flows && searchInfo.flows.size > 0) ||
                     (searchInfo.definitions && searchInfo.definitions.length > 0) ||
                     (searchInfo.documents && searchInfo.documents.length > 0);

  if (hasContent) {
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

// Direct execution only — `require()`-ing this module (tests) must not
// consume stdin or run the dispatcher.
if (require.main === module) {
  main();
}

module.exports = {
  commitVisiblyFailed,
  handlePostToolUse,
  handlePreToolUse,
};
