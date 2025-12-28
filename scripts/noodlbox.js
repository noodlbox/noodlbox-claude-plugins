#!/usr/bin/env node
/**
 * Noodlbox Claude Code Plugin Hooks
 *
 * Unified hook handler for multiple Claude Code events:
 *
 * 1. SessionStart - Injects architecture context on fresh session start
 * 2. PreToolUse (Glob/Grep) - Enhances search with semantic context
 *
 * This script is called by Claude Code via the plugin hooks configuration.
 * It uses ${CLAUDE_PLUGIN_ROOT} to locate itself within the plugin directory.
 */

const { execFileSync } = require('child_process');
const path = require('path');

// Configuration
const NOODL_PATH = process.env.NOODL_PATH || 'noodl';
const SEARCH_TIMEOUT_MS = 30000;
const SESSION_TIMEOUT_MS = 10000;
const MAX_PROCESSES = 5;
const MAX_SYMBOLS = 10;
const MAX_COMMAND_LENGTH = 1000; // ReDoS protection

async function readInput() {
  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return JSON.parse(data);
}

/**
 * SessionStart handler - injects architecture context
 */
async function handleSessionStart(input) {
  const cwd = input.cwd || process.cwd();
  const source = input.source || 'startup';

  // Only inject on fresh startup, not resume/clear/compact
  if (source !== 'startup') {
    return;
  }

  try {
    const result = execFileSync(
      NOODL_PATH,
      ['search', 'main entry points core architecture', cwd, '-f', 'markdown', '--limit', '5'],
      { encoding: 'utf-8', timeout: SESSION_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    if (result && !result.includes('not indexed') && result.trim().length > 50) {
      const repoName = path.basename(cwd);
      console.log(`<noodlbox-indexed-repository path="${cwd}">
This repository has been indexed by Noodlbox for semantic code search.

**Available tools:**
- mcp__plugin_noodlbox_noodlbox__noodlbox_query_with_context - Semantic code search (finds execution flows, not just files)
- mcp__plugin_noodlbox_noodlbox__noodlbox_detect_impact - Analyze blast radius of git changes
- mcp__plugin_noodlbox_noodlbox__noodlbox_raw_cypher_query - Direct graph queries

**Available resources (read with ReadMcpResourceTool):**
- map://${repoName} - Architecture overview with communities and key processes
- db://schema/${repoName} - Graph database schema

**Tip:** Read the map resource first to understand codebase structure before searching.
</noodlbox-indexed-repository>`);
    }
  } catch {
    // Silently exit - repo not indexed or noodl not available
  }
}

/**
 * Extract search query from tool input
 */
function extractQueryFromTool(toolName, toolInput) {
  if (toolName === 'Glob') {
    const pattern = toolInput.pattern || '';
    const parts = pattern
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
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
 * PreToolUse handler - enhances Glob/Grep/Bash with semantic context
 */
async function handlePreToolUse(input) {
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const cwd = input.cwd || process.cwd();

  // Only enhance Glob/Grep/Bash
  if (toolName !== 'Glob' && toolName !== 'Grep' && toolName !== 'Bash') {
    console.log(JSON.stringify({ decision: 'approve' }));
    return;
  }

  const query = extractQueryFromTool(toolName, toolInput);

  // Skip if no meaningful query
  if (!query || query.length < 3) {
    console.log(JSON.stringify({ decision: 'approve' }));
    return;
  }

  try {
    const result = execFileSync(
      NOODL_PATH,
      ['search', query, cwd, '-f', 'markdown', '--limit', String(MAX_PROCESSES), '--max-symbols', String(MAX_SYMBOLS)],
      { encoding: 'utf-8', timeout: SEARCH_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    if (result && result.trim().length > 0 && !result.includes('not indexed')) {
      // Approve with additional context
      console.log(JSON.stringify({
        decision: 'approve',
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: result.trim()
        }
      }));
    } else {
      // No results or not indexed - just approve
      console.log(JSON.stringify({ decision: 'approve' }));
    }
  } catch {
    // On error, just approve without context
    console.log(JSON.stringify({ decision: 'approve' }));
  }
}

async function main() {
  const input = await readInput();
  const hookEvent = input.hook_event_name || '';

  if (hookEvent === 'SessionStart') {
    await handleSessionStart(input);
  } else if (hookEvent === 'PreToolUse') {
    await handlePreToolUse(input);
  } else {
    // Unknown hook - approve by default for PreToolUse-like events
    if (input.tool_name) {
      console.log(JSON.stringify({ decision: 'approve' }));
    }
  }
}

main().catch(() => {
  // On any error, approve (for PreToolUse) or exit silently (for SessionStart)
  console.log(JSON.stringify({ decision: 'approve' }));
});
