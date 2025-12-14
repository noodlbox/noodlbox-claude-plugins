---
description: Analyze git changes to understand impact
argument-hint: [change_scope]
---

# Detect Impact from Code Changes

The `noodlbox_detect_impact` tool analyzes your uncommitted git changes and maps them to the code knowledge graph, showing exactly which processes and symbols are affected.

---

## Understanding the Tool

### What It Does
1. **Analyzes git diff** to find changed lines
2. **Maps changes to symbols** in the code knowledge graph
3. **Traces impact** through process flows to find affected business logic
4. **Ranks results** by relevance (more changed symbols = higher priority)

### Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `repository` | (required) | Repository name from `noodl list` |
| `change_scope` | `"unstaged"` | What changes to analyze |
| `base_ref` | `"HEAD"` | Base reference for comparison (only for `compare` scope) |
| `include_content` | `false` | Include symbol code in response |
| `max_processes` | `10` | Results per page (1-50) |
| `page` | `0` | Page number for pagination |

### Change Scope Options

| Scope | Git Equivalent | Use Case |
|-------|---------------|----------|
| `"unstaged"` | `git diff` | See impact before staging |
| `"staged"` | `git diff --staged` | Review what you're about to commit |
| `"all"` | `git diff HEAD` | Complete impact of all uncommitted work |
| `"compare"` | `git diff <base_ref>` | Compare with specific branch/commit |

---

## Example Usage

### Basic: Check Unstaged Changes
```json
{
  "repository": "my-project",
  "change_scope": "unstaged"
}
```

### Pre-Commit: Review Staged Changes
```json
{
  "repository": "my-project",
  "change_scope": "staged"
}
```

### Code Review: Compare with Main Branch
```json
{
  "repository": "my-project",
  "change_scope": "compare",
  "base_ref": "main"
}
```

### Deep Analysis: Include Symbol Content
```json
{
  "repository": "my-project",
  "change_scope": "all",
  "include_content": true,
  "max_processes": 20
}
```

---

## Interpreting Results

### Summary Section
```
summary:
  changed_symbols_count: 3      # Direct changes you made
  changed_files_count: 2        # Files with modifications
  total_impacted_processes: 12  # Business flows affected
  total_impacted_symbols: 47    # Total symbols in affected flows
  total_lines_changed: 85       # Lines added/deleted
```

**Risk Assessment:**
- `changed_symbols_count` < 5, `total_impacted_processes` < 10 → Low risk
- `changed_symbols_count` 5-15, `total_impacted_processes` 10-30 → Medium risk
- `changed_symbols_count` > 15 or `total_impacted_processes` > 30 → High risk, review carefully

### Changed Symbols
```
changed_symbols:
  - id: "abc123"
    name: "processPayment"
    file_path: "src/payments/processor.ts"
    change_type: "Modified"
```

These are your **root cause** - the actual code you changed.

### Changed Files
```
changed_files:
  - path: "src/payments/processor.ts"
    has_symbols: true
    symbol_count: 2
    lines_added: 15
    lines_deleted: 8
```

Files without symbols (`has_symbols: false`) are config, docs, or unsupported languages.

### Impacted Processes
```
impacted_processes:
  - id: "proc-001"
    summary: "Payment Processing Flow"
    entry_point_id: "entry-123"
    symbols:
      - name: "handleCheckout"
        is_changed: false        # Downstream impact
        step_index: 0            # First in execution flow
      - name: "processPayment"
        is_changed: true         # Your change!
        step_index: 1
      - name: "sendReceipt"
        is_changed: false        # Also affected
        step_index: 2
```

**Key Fields:**
- `is_changed: true` → Your direct modification
- `is_changed: false` → Downstream/upstream impact
- `step_index` → Order in execution flow (0 = entry point)
- `centrality_score` → Importance (higher = more critical)

### Selection Range (Navigation)
Each symbol includes precise location info:
```
selection_range_start_line: 45      # Symbol name starts here
selection_range_start_character: 10
```

Use these for IDE navigation: `file_path:selection_range_start_line`

---

## Common Patterns

### Pattern 1: High Impact, Few Changes
```
changed_symbols_count: 2
total_impacted_processes: 25
```
**Meaning:** You changed critical code. Review each impacted process carefully.

### Pattern 2: Many Changes, Low Impact
```
changed_symbols_count: 15
total_impacted_processes: 3
```
**Meaning:** Changes are isolated. Likely safe but verify test coverage.

### Pattern 3: No Symbol Changes
```
changed_symbols_count: 0
changed_files_count: 5
message: "No changes detected in analyzed code files..."
```
**Meaning:** Changes in config, docs, or unsupported languages. No code impact.

### Pattern 4: Cross-Module Impact
If impacted processes span multiple communities (check process summaries), coordinate with those teams.

---

## Pagination for Large Results

When `has_more: true`, fetch additional pages:

```json
{
  "repository": "my-project",
  "change_scope": "all",
  "page": 1,
  "max_processes": 20
}
```

Continue until `has_more: false`.

---

## Best Practices

1. **Before committing**: Run with `"staged"` scope to verify intent
2. **During code review**: Use `"compare"` scope with target branch
3. **For refactoring**: Check `total_impacted_symbols` to gauge blast radius
4. **High centrality symbols**: Extra scrutiny - they affect many other parts
5. **Cross-module changes**: Coordinate with affected teams
6. **Use content sparingly**: `include_content: true` increases response size significantly

---

## Troubleshooting

### "No uncommitted changes detected"
- Working tree is clean (all committed)
- Run `git status` to verify

### "No changes detected in analyzed code files"
- Changes only in non-code files (config, docs)
- Changes in unsupported languages
- Files couldn't be parsed

### Low relationship coverage
- Repository may need re-analysis after recent changes
- Run `noodl analyze <path> --force` to refresh

---

**Use the `noodlbox_detect_impact` tool to understand your change's ripple effects before they become production issues.**
