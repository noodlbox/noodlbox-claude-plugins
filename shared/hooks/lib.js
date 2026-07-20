/**
 * Noodlbox Shared Hook Utilities
 *
 * Common functions for semantic search augmentation across platforms.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const path = require('path');

const NOODL_PATH = process.env.NOODLBOX_CLI_PATH || 'noodl';
const SEARCH_TIMEOUT_MS = 5000;
const MAX_COMMAND_LENGTH = 1000;
const DEBUG = process.env.NOODLBOX_HOOK_DEBUG === 'true';

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
 * User-visible logging - always outputs to stderr.
 * Uses a distinctive prefix so users know noodlbox is working.
 */
function log(message) {
  console.error(`\x1b[36m[noodlbox]\x1b[0m ${message}`);
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  white: '\x1b[97m',        // bright white for arrows/headers
  dim: '\x1b[2m',           // dimmed secondary info
  green: '\x1b[32m',        // search hits (FTS matches)
  yellow: '\x1b[33m',       // augmented symbols (non-FTS)
  magenta: '\x1b[35m',      // entry point diamonds
  cyan: '\x1b[36m',         // definitions and docs
  gray: '\x1b[90m',         // separator, secondary text
};

/**
 * Parse noodl search results to extract workflow traces grouped by entry point.
 * Handles both text format (from noodl search CLI) and JSON format (from MCP).
 * Returns: { flows, definitions, documents, ftsMatches }
 */
function parseSearchResults(resultText) {
  if (!resultText) return emptyInfo();

  // Every producer emits JSON: `noodl search` via serde_json::to_string, and
  // the remote MCP `query_with_context` tool as a { result: {...} } envelope.
  let data;
  try {
    data = typeof resultText === 'string' ? JSON.parse(resultText) : resultText;
  } catch {
    return emptyInfo();
  }

  // Remote MCP wraps the payload under `.result`; the CLI is already top-level.
  return parseContextResult(data && data.result ? data.result : data);
}

/**
 * Empty parse result — the shape every consumer (buildSectionedDisplay,
 * formatSearchMessage) expects.
 */
function emptyInfo() {
  return {
    flows: new Map(),
    definitions: [],
    documents: [],
    ftsMatches: new Set(),
    totalFlows: 0,
  };
}

/**
 * Parse a context-search result into { flows, definitions, documents, ftsMatches }.
 *
 * Both live producers share the top-level shape
 * ({ workflows, workflow_symbols, definitions, documents }) but differ in how a
 * workflow symbol links to its workflow and carries step order:
 * - `noodl search` (CLI): link in `metadata.workflow_id`, order = array order.
 * - remote MCP `query_with_context`: link in top-level `workflow_id`, order in `step_index`.
 */
function parseContextResult(data) {
  const info = emptyInfo();
  if (!data || typeof data !== 'object') return info;

  const workflows = Array.isArray(data.workflows) ? data.workflows : [];
  const workflowSymbols = Array.isArray(data.workflow_symbols) ? data.workflow_symbols : [];
  const definitions = Array.isArray(data.definitions) ? data.definitions : [];
  const documents = Array.isArray(data.documents) ? data.documents : [];

  // Group symbols by their workflow, tracking FTS hits along the way.
  const symbolsByWorkflow = new Map();
  for (const sym of workflowSymbols) {
    const workflowId = sym.metadata?.workflow_id || sym.workflow_id;
    if (workflowId) {
      if (!symbolsByWorkflow.has(workflowId)) symbolsByWorkflow.set(workflowId, []);
      symbolsByWorkflow.get(workflowId).push(sym);
    }
    if (sym.is_fts_match && sym.name) info.ftsMatches.add(sym.name);
  }

  // Build entry-point → chain flows from each workflow's symbols.
  for (const workflow of workflows) {
    const symbols = symbolsByWorkflow.get(workflow.id) || [];
    if (symbols.length === 0) continue;

    // CLI emits symbols in execution order (no step_index); MCP carries step_index.
    const ordered = [...symbols].sort((a, b) => (a.step_index ?? 0) - (b.step_index ?? 0));
    const names = ordered
      .map(s => s.name)
      .filter(name => typeof name === 'string' && name.length > 2);
    if (names.length === 0) continue;

    const entryPoint = names[0];
    const chain = names.slice(1, 5); // cap at 4 more
    if (!info.flows.has(entryPoint)) info.flows.set(entryPoint, []);

    if (chain.length > 0) {
      const chainKey = chain.join('→');
      const existing = info.flows.get(entryPoint);
      if (!existing.some(f => f.join('→') === chainKey)) {
        existing.push(chain);
        info.totalFlows++;
      }
    } else {
      info.totalFlows++;
    }
  }

  // Standalone definitions (deduped by name).
  const seenDefs = new Set();
  for (const def of definitions) {
    if (def.name && def.name.length > 2 && !seenDefs.has(def.name)) {
      seenDefs.add(def.name);
      info.definitions.push(def.name);
      if (def.is_fts_match) info.ftsMatches.add(def.name);
    }
  }

  // Matched documents — MCP nests title/path under `metadata`.
  for (const doc of documents) {
    const meta = doc.metadata || doc;
    const title = meta.title || meta.file_path || doc.title || doc.file_path || doc.path;
    if (!title) continue;
    const shortTitle = meta.title && meta.title.length < 40
      ? meta.title
      : title.split('/').slice(-2).join('/');
    info.documents.push(shortTitle);
  }

  return info;
}

/**
 * Build sectioned display with FLOWS, DEFINITIONS, DOCS.
 *
 * Format:
 * FLOWS:
 * ◆ EntryPoint → callee1 → callee2
 * ◆ EntryPoint2 → callee3
 *
 * DEFINITIONS:
 * • auth, handleAuth, createToken
 *
 * DOCS:
 * • README.md, auth/guide.md
 */
function buildSectionedDisplay(info) {
  const { green, yellow, magenta, cyan, gray, white, reset } = colors;
  const lines = [];

  // Format symbol name - green for search hits, yellow for flow symbols
  const formatSymbol = (name) => {
    if (info.ftsMatches && info.ftsMatches.has(name)) {
      return `${green}${name}${reset}`;
    }
    return `${yellow}${name}${reset}`;
  };

  // FLOWS section
  if (info.flows && info.flows.size > 0) {
    lines.push(`${white}FLOWS:${reset}`);
    const maxFlows = 8;
    let flowCount = 0;

    for (const [entryPoint, flowChains] of info.flows) {
      if (flowCount >= maxFlows) break;

      // Build compact flow: EntryPoint → callee1 → callee2
      const entryDisplay = formatSymbol(entryPoint);
      if (flowChains.length > 0 && flowChains[0].length > 0) {
        const chain = flowChains[0].slice(0, 3).map(s => formatSymbol(s));
        lines.push(`${magenta}◆${reset} ${entryDisplay} ${white}→${reset} ${chain.join(` ${white}→${reset} `)}`);
      } else {
        lines.push(`${magenta}◆${reset} ${entryDisplay}`);
      }
      flowCount++;
    }

    if (info.flows.size > maxFlows) {
      lines.push(`${gray}  ... +${info.flows.size - maxFlows} more${reset}`);
    }
  }

  // DEFINITIONS section
  if (info.definitions && info.definitions.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`${white}DEFINITIONS:${reset}`);
    const maxDefs = 10;
    const defsToShow = info.definitions.slice(0, maxDefs);
    const defList = defsToShow.map(d => formatSymbol(d)).join(', ');
    lines.push(`${cyan}•${reset} ${defList}`);
    if (info.definitions.length > maxDefs) {
      lines.push(`${gray}  ... +${info.definitions.length - maxDefs} more${reset}`);
    }
  }

  // DOCS section - one per line
  if (info.documents && info.documents.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`${white}DOCS:${reset}`);
    const maxDocs = 5;
    const docsToShow = info.documents.slice(0, maxDocs);
    for (const doc of docsToShow) {
      lines.push(`${cyan}•${reset} ${cyan}${doc}${reset}`);
    }
    if (info.documents.length > maxDocs) {
      lines.push(`${gray}  ... +${info.documents.length - maxDocs} more${reset}`);
    }
  }

  return lines.join('\n');
}

/**
 * Truncate query for display, keeping it readable.
 */
function truncateQuery(query, maxLen = 30) {
  if (query.length <= maxLen) return query;
  return query.slice(0, maxLen - 3) + '...';
}

/**
 * Format search info into a concise, informative message.
 * Shows three sections: FLOWS, DEFINITIONS, DOCS.
 */
function formatSearchMessage(query, info, elapsed) {
  const displayQuery = truncateQuery(query, 35);
  const { dim, gray, reset } = colors;

  const timeStr = elapsed > 0 ? ` ${dim}(${elapsed}ms)${reset}` : '';
  const header = `Search: "${displayQuery}"${timeStr}`;

  // Build sectioned display
  const sectionDisplay = buildSectionedDisplay(info);

  if (sectionDisplay) {
    const { green, yellow, reset: r } = colors;
    const legend = `${green}search hit${r}  ${yellow}augmented${r}`;
    const separator = `${gray}─────────────────────────────────────${reset}`;
    return `${header}\n${legend}\n${separator}\n${sectionDisplay}`;
  }

  return header;
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
 * Walk up from `startDir` to the box root — the nearest ancestor holding a
 * committed `.nbx/nbx.toml`. Bounded to avoid pathological loops on odd
 * filesystems. Returns the box-root dir, or null if none is found.
 */
function findBoxRoot(startDir) {
  let dir = startDir;
  for (let depth = 0; depth < 64; depth++) {
    if (fs.existsSync(path.join(dir, '.nbx', 'nbx.toml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // reached the filesystem root
    dir = parent;
  }
  return null;
}

/**
 * Read the box id (`[box_meta] id`) from a box root's committed nbx.toml — the
 * storage key for `~/.noodlbox/boxes/{id}/`. Section-scoped so it can never
 * pick up a `[[repos]] repo_id`, and shape-validated as a UUID. Returns the id
 * string, or null.
 */
function readBoxId(boxRoot) {
  try {
    const toml = fs.readFileSync(path.join(boxRoot, '.nbx', 'nbx.toml'), 'utf-8');
    const section = toml.match(/\[box_meta\]([\s\S]*?)(?:\r?\n\[|$)/);
    if (!section) return null;
    const id = section[1].match(/^\s*id\s*=\s*"([0-9a-fA-F-]{36})"/m);
    return id ? id[1] : null;
  } catch {
    return null;
  }
}

/**
 * Whether `cwd` sits inside a LOCALLY-analyzed box — read straight from the
 * filesystem source of truth, no cache. Walk up to the box's committed
 * `.nbx/nbx.toml`, read its box id, and check `~/.noodlbox/boxes/{id}/db/`
 * exists (the same db-exists proxy the CLI uses for "analyzed"; a box's
 * analysis output lives there and is NOT committed, so this is the LOCAL index
 * state — a fresh clone reads false until `noodl analyze` runs on this machine).
 *
 * Self-refreshing: analyze a box and the next tool call sees it. There is no
 * cache file and no external writer to go missing. (The previous
 * `~/.noodlbox/cache/repositories.json` gate had NO writer after the
 * repositories->boxes migration, so it silently skipped every repo — ambient
 * search never fired.)
 *
 * Returns:
 * - { box_id, box_name, indexed: true } when cwd is in an analyzed box
 * - false when cwd is in a box not analyzed locally yet (.nbx/ present, no db/)
 * - null when cwd is not inside any box
 */
function getIndexedRepoInfo(cwd) {
  try {
    // Resolve symlinks so the walk matches how the box lives on disk
    // (e.g. macOS /var -> /private/var).
    let resolvedCwd = cwd;
    try {
      resolvedCwd = fs.realpathSync(cwd);
    } catch {
      // Path may not be resolvable — fall back to the raw cwd.
    }

    const boxRoot = findBoxRoot(resolvedCwd);
    if (!boxRoot) {
      debug('No .nbx/ box root at or above cwd');
      return null;
    }

    const boxId = readBoxId(boxRoot);
    if (!boxId) {
      debug('Could not read [box_meta] id from nbx.toml', { boxRoot });
      return null;
    }

    const dbPath = path.join(os.homedir(), '.noodlbox', 'boxes', boxId, 'db');
    const indexed = fs.existsSync(dbPath);
    debug('Box resolved from .nbx/', { boxRoot, boxId, indexed });
    return indexed
      ? { box_id: boxId, box_name: path.basename(boxRoot), indexed: true }
      : false;
  } catch (e) {
    debug('getIndexedRepoInfo error:', e.message);
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
/**
 * Run a `noodl` subcommand that prints a plain-text digest to stdout.
 * Resolves symlinks in cwd (noodl stores realpaths) and never throws —
 * hooks are fail-open by contract.
 */
function runNoodlDigest(args, cwd, timeoutMs, label) {
  const start = Date.now();
  try {
    let resolvedCwd = cwd;
    try {
      resolvedCwd = fs.realpathSync(cwd);
    } catch {
      // Fall back to the raw cwd (matches runNoodlSearch/getIndexedRepoInfo).
    }
    const result = execFileSync(
      NOODL_PATH,
      args,
      { cwd: resolvedCwd, timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' }
    );
    return { success: true, result, elapsed: Date.now() - start };
  } catch (e) {
    debug(`${label} failed:`, e.message);
    return { success: false, result: '', elapsed: Date.now() - start };
  }
}


// Verify audits the WHOLE working-tree diff (baseline reads + lenses),
// so it gets more headroom than a one-file map read and
// search (5s); the Bash hook ceiling is 30s.
const VERIFY_DIGEST_TIMEOUT_MS = 15000;


/**
 * Does this Bash command run `git commit`? Tokenizer-based (reuses the
 * quote-aware `tokenize`, the same parser `extractQueryFromBash` trusts)
 * instead of a raw-string regex, so shell operators inside QUOTED
 * arguments never count as separators (`echo "step done; git commit
 * next"` is not a commit) and quoted text never fakes a command. Rules:
 * `commit` must be git's subcommand — `git` at a command position
 * (segment head, after `&&`/`||`/`;`/`|`, after inline `VAR=x`
 * prefixes, or at the head of a newline-split line), with value-taking
 * global flags (`-c`, `-C`, `--git-dir`, `--work-tree`, `--namespace`,
 * `--exec-path`) skipped together with their values. `git commit-tree`,
 * `git help commit`, and `git log --grep commit` do not match. Lines
 * are split BEFORE tokenizing so `git add -A\ngit commit` matches; a
 * quoted multi-line commit message still detects on its first line.
 */
function isCommitCommand(command) {
  if (!command) return false;
  const VALUE_FLAGS = new Set([
    '-c', '-C', '--git-dir', '--work-tree', '--namespace', '--exec-path',
  ]);
  const OPERATORS = new Set(['&&', '||', ';', '|']);
  for (const line of command.split(/\r?\n/)) {
    const tokens = tokenize(line);
    let expectCmd = true;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (OPERATORS.has(tok)) {
        expectCmd = true;
        continue;
      }
      if (!expectCmd) continue;
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tok)) continue; // env prefix
      if (path.basename(tok) === 'git') {
        let j = i + 1;
        while (j < tokens.length && tokens[j].startsWith('-')) {
          j += VALUE_FLAGS.has(tokens[j]) ? 2 : 1;
        }
        if (tokens[j] === 'commit') return true;
      }
      expectCmd = false;
    }
  }
  return false;
}

/**
 * Run `noodl verify --digest` — the commit-boundary structural audit
 * (Project 74 moment 4 delivered where the agent already is). Fail-open.
 */
function runNoodlVerifyDigest(cwd) {
  return runNoodlDigest(['verify', '--digest', '--audience', 'agent'], cwd, VERIFY_DIGEST_TIMEOUT_MS, 'verify digest');
}

/** Session-scoped verify-audit state file path. */
function verifyAuditStateFile(sessionId) {
  const key = sessionId || 'no-session';
  return path.join(os.tmpdir(), `noodlbox-verify-audit-${key}.json`);
}

/**
 * Content-dedup for the commit-boundary audit: the SAME digest is never
 * injected twice in one session (kills retry spam and the repeated
 * stale banner after the first commit moves HEAD — review M2), while a
 * genuinely CHANGED digest still fires. Tmp-state + 48h GC.
 */
function verifyAuditAlreadyDelivered(sessionId, digest) {
  const hash = crypto.createHash('sha256').update(digest).digest('hex');
  return readProspectusSeen(verifyAuditStateFile(sessionId)).includes(hash);
}

function markVerifyAuditDelivered(sessionId, digest) {
  const hash = crypto.createHash('sha256').update(digest).digest('hex');
  const stateFile = verifyAuditStateFile(sessionId);
  const seen = readProspectusSeen(stateFile);
  if (!seen.includes(hash)) seen.push(hash);
  try {
    fs.writeFileSync(stateFile, JSON.stringify(seen));
  } catch (e) {
    debug('verify-audit state write failed:', e.message);
  }
  try {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(os.tmpdir())) {
      if (!name.startsWith('noodlbox-verify-audit-')) continue;
      const full = path.join(os.tmpdir(), name);
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    }
  } catch {
    // GC is best-effort.
  }
}

function runNoodlSearch(query, cwd) {
  try {
    // Resolve symlinks to match how noodl stores paths (e.g., /var -> /private/var on macOS)
    let resolvedCwd = cwd;
    try {
      resolvedCwd = fs.realpathSync(cwd);
    } catch {
      // If realpath fails, use original cwd
    }

    const startTime = Date.now();
    let result = execFileSync(
      NOODL_PATH,
      ['search', query, '--box', resolvedCwd, '--limit', '50'],
      { encoding: 'utf-8', timeout: SEARCH_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const elapsed = Date.now() - startTime;

    // Shorten absolute paths to relative (handle both original and resolved paths)
    const resolvedCwdWithSlash = resolvedCwd.endsWith('/') ? resolvedCwd : resolvedCwd + '/';
    const cwdWithSlash = cwd.endsWith('/') ? cwd : cwd + '/';
    result = result.replaceAll(resolvedCwdWithSlash, './').replaceAll(cwdWithSlash, './');

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
  isCommitCommand,
  runNoodlVerifyDigest,
  verifyAuditAlreadyDelivered,
  markVerifyAuditDelivered,
  debug,
  log,
  readInput,
  cleanRegexPattern,
  getIndexedRepoInfo,
  extractQueryFromGlob,
  extractQueryFromGrep,
  extractQueryFromBash,
  runNoodlSearch,
  listRepositories,
  parseSearchResults,
  formatSearchMessage,
  NOODL_PATH,
};
