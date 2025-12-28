# Noodlbox Hooks

Claude Code lifecycle hooks that automatically inject codebase context and enhance search tools.

## Overview

The Noodlbox plugin uses hooks to:
1. **SessionStart** - Inject architecture overview on fresh session startup
2. **PreToolUse** - Enhance Glob/Grep/Bash search tools with semantic context

## Files

| File | Purpose |
|------|---------|
| `noodlbox.js` | Unified hook handler for all events |
| `../hooks/hooks.json` | Hook configuration (referenced by plugin.json) |

## Hook Events

### SessionStart

Triggered when a new Claude Code session starts. Injects repository architecture context if the repo is indexed by Noodlbox.

**Output:** XML block with available MCP tools and resources.

### PreToolUse (Glob/Grep/Bash)

Triggered before Glob, Grep, or Bash search tools execute. Extracts search patterns and provides semantic context from the knowledge graph.

**Supported Bash commands:**
- `grep`, `egrep`, `fgrep`
- `rg` (ripgrep)
- `ag` (silver searcher)
- `ack`
- `find -name`, `find -iname`

**Behavior:** Approves the tool and adds `additionalContext` with related code symbols and execution flows.

## Installation

### Via Claude Code Plugin (Recommended)

```bash
/plugin install noodlbox@noodlbox-claude-plugins
```

The plugin automatically configures hooks via `plugin.json`.

### Manual Configuration

Add to `~/.claude/settings.json` or `<project>/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Glob|Grep|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/noodlbox.js",
            "timeout": 30
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/noodlbox.js",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NOODL_PATH` | `noodl` | Path to the noodl CLI binary |

Script constants (in noodlbox.js):

| Constant | Default | Description |
|----------|---------|-------------|
| `SEARCH_TIMEOUT_MS` | `30000` | Timeout for PreToolUse search (ms) |
| `SESSION_TIMEOUT_MS` | `10000` | Timeout for SessionStart (ms) |
| `MAX_PROCESSES` | `5` | Maximum execution flows to return |
| `MAX_SYMBOLS` | `10` | Maximum symbols per process |
| `MAX_COMMAND_LENGTH` | `1000` | Maximum Bash command length (ReDoS protection) |

## Testing

### Test SessionStart

```bash
echo '{"hook_event_name": "SessionStart", "source": "startup", "cwd": "/path/to/project"}' | \
  node noodlbox.js
```

### Test PreToolUse (Grep)

```bash
echo '{"hook_event_name": "PreToolUse", "tool_name": "Grep", "tool_input": {"pattern": "handleAuth"}, "cwd": "/path/to/project"}' | \
  node noodlbox.js
```

Expected output:
```json
{
  "decision": "approve",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "## Relevant Code\n\n..."
  }
}
```

### Test PreToolUse (Bash)

```bash
echo '{"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": "grep -r handleAuth src/"}, "cwd": "/path/to/project"}' | \
  node noodlbox.js
```

## Troubleshooting

### Hook not firing

1. Check settings.json syntax is valid
2. Verify hook path is correct
3. Check Claude Code logs for errors
4. Ensure `matcher` regex matches the tool name

### No context returned

1. Ensure repository is analyzed: `noodl list`
2. Check noodl path: `which noodl` or set `NOODL_PATH`
3. Run test commands above to see errors

### Slow response

1. Reduce `MAX_PROCESSES` and `MAX_SYMBOLS` for faster results
2. Check if the knowledge graph query is timing out
3. Verify noodl CLI is working: `noodl search "test" /path/to/project`

## Security

The hook uses `execFileSync` with array arguments to prevent command injection. User input is never interpolated into shell strings.

Input length is limited (`MAX_COMMAND_LENGTH`) to prevent ReDoS attacks on regex patterns.
