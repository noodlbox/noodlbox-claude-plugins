---
name: change-planning
description: >-
  Analyze blast radius, check what will break, review changes before commit. Use
  for pre-commit review, PR risk assessment, planning safe refactors, or checking
  if changes are safe to merge. NOT for debugging (use debugging) or exploring
  unfamiliar code (use exploring-codebases).
metadata:
  author: noodlbox
  version: "{{VERSION}}"
---

# Change Planning

Analyze uncommitted git changes and understand their ripple effects through the codebase.

## Quick Decision

| Workflow | change_scope | base_ref |
|----------|--------------|----------|
| Before staging | `"unstaged"` | - |
| Before commit | `"staged"` | - |
| All uncommitted | `"all"` | - |
| Compare to branch | `"compare"` | `"main"` |

## Tool Reference

### noodlbox_detect_impact

Detect which processes are affected by git changes.

```
noodlbox_detect_impact(
  repository: "current",
  change_scope: "all",
  include_content: false,
  max_processes: 10
)
```

**Parameters**:
- `change_scope`: What changes to analyze (see table above)
- `base_ref`: Branch/commit to compare against (for `"compare"` scope)
- `include_content`: Include symbol source code in response
- `max_processes`: Limit results per page

## Risk Assessment

| Metric | Low Risk | Medium Risk | High Risk |
|--------|----------|-------------|-----------|
| `changed_symbols_count` | < 5 | 5-15 | > 15 |
| `total_impacted_processes` | < 10 | 10-30 | > 30 |
| Cross-community changes | None | 1-2 | > 2 |

## Workflow Checklist

### Pre-Commit Review

```
Pre-Commit Checklist:
- [ ] Run impact detection (scope: staged)
- [ ] Check changed_symbols count
- [ ] Review each impacted_process
- [ ] Verify changes are intentional
- [ ] Split commit if impact > 10 processes
```

### Code Review

```
Code Review Checklist:
- [ ] Run impact detection (scope: compare, base_ref: target_branch)
- [ ] Check cross-community impact
- [ ] Verify test coverage for impacted areas
- [ ] Flag high-centrality changes
- [ ] Document coordination needs
```

For detailed workflow guidance, see [workflows.md](workflows.md).

## Example: Pre-Commit Check

**Task**: "What will my changes affect before I commit?"

```
Step 1: Run impact detection
noodlbox_detect_impact(
  repository: "current",
  change_scope: "staged"
)

→ Summary:
  changed_symbols_count: 3
  total_impacted_processes: 7

→ Changed symbols:
  - validatePayment (src/payments/validator.ts:42) - Modified
  - PaymentError (src/payments/errors.ts:15) - Modified
  - formatAmount (src/payments/utils.ts:88) - Modified

→ Impacted processes:
  - "Checkout flow" (5 steps affected)
  - "Payment retry" (3 steps affected)
  - "Webhook handler" (2 steps affected)

Step 2: Assess risk
Changed: 3 symbols → Low
Impacted: 7 processes → Low
Cross-community: None → Low
Overall: Low risk

Step 3: Verify intentionality
All impacted processes are payment-related.
Changes are contained within the payments module.
✓ Safe to commit
```

**Checklist for this example**:
```
- [x] Run impact detection (scope: staged)
- [x] Check changed_symbols count (3 - low)
- [x] Review impacted processes (7 - all payment-related)
- [x] Verify changes are intentional (yes, contained)
- [ ] Split commit if needed (not needed)
```

## Output Format

### Low Impact (< 10 processes)

```markdown
## Impact Summary

- **Changed**: 3 symbols in 2 files
- **Affected**: 7 processes
- **Risk**: Low

## Changed Code

| Symbol | File | Type |
|--------|------|------|
| validatePayment | src/payments/validator.ts:42 | Modified |

## Affected Flows

1. **Checkout flow** - 5 steps include changed symbols
   - Entry: `handleCheckout` → `processPayment` → `validatePayment`
   - Risk: Low (isolated change)

## Recommendations

- [ ] Run payment integration tests
- [ ] Verify checkout flow manually
```

### High Impact (> 10 processes)

Delegate to codebase-analyst agent for detailed analysis.

## When to Use Something Else

| Need | Use Instead |
|------|-------------|
| Explore unfamiliar code | exploring-codebases skill |
| Generate documentation | generating-documentation skill |
| Debug failing code | debugging skill |
| Plan large refactors | refactoring skill |
