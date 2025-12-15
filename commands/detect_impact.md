---
description: Analyze git changes to understand impact
argument-hint: [change_scope]
---

# Detect Impact from Code Changes

Analyze uncommitted git changes and understand their ripple effects through the codebase.

## Step 1: Run Impact Detection

```
noodlbox_detect_impact(repository: "current", change_scope: "$ARGUMENTS")
```

**Change scope options:**

| Scope | Git Equivalent | Use Case |
|-------|---------------|----------|
| `unstaged` | `git diff` | Before staging |
| `staged` | `git diff --staged` | Before commit |
| `all` | `git diff HEAD` | All uncommitted (default) |
| `compare` | `git diff <base>` | Compare with branch |

If no argument provided, use `"all"` for complete uncommitted changes.

## Step 2: Assess Scale

Check the summary in the response:

| Metric | Low Impact | High Impact |
|--------|------------|-------------|
| `changed_symbols_count` | < 5 | >= 5 |
| `total_impacted_processes` | < 10 | >= 10 |

## Step 3: Generate Analysis

### Low Impact (< 10 processes)

Analyze inline:

1. List changed symbols with file locations
2. For each impacted process, summarize the execution flow
3. Identify risk level based on centrality scores
4. Check for cross-community impact

### High Impact (>= 10 processes)

Spawn codebase-analyst agent for deep analysis:

```
Task: impact_analysis for current changes
Input: Impact detection results
Output: Structured risk assessment
```

The agent handles detailed tracing and returns prioritized recommendations.

## Step 4: Present Results

### For Low Impact

```markdown
## Impact Summary

- **Changed**: X symbols in Y files
- **Affected**: Z processes
- **Risk**: Low

## Changed Code

| Symbol | File | Type |
|--------|------|------|
| functionName | src/path.ts:42 | Modified |

## Affected Flows

1. **Process Name** - Brief description
   - Entry: `entryPoint` → `step2` → `changedSymbol`
   - Risk: Low (isolated change)

## Recommendations

- [ ] Test: List specific tests to run
- [ ] Review: Any areas needing attention
```

### For High Impact

Present the agent's structured analysis:

```markdown
## Impact Summary

- **Risk Level**: Medium/High
- **Changed**: X symbols
- **Affected**: Y processes in Z communities

## Critical Paths

| Process | Why Critical | Action |
|---------|--------------|--------|
| Payment Flow | High centrality, cross-module | Full regression test |

## Cross-Module Impact

| Source | Target | Impact |
|--------|--------|--------|
| Auth | User Management | Session changes propagate |

## Recommendations

### Test Priority
1. Critical path tests first
2. Integration tests for cross-module flows

### Review Focus
- High-centrality symbol changes
- Cross-community boundaries

### Coordination
- Teams/modules to notify
```

## Labels Integration

If `.noodlbox/labels.json` exists:
- Use community labels in output
- Use process labels for flow names
- Include descriptions for context

## Output

Confirm analysis with:
- Risk level assessment
- Number of affected processes
- Key recommendations
