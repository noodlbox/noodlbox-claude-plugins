# Impact Assessment Workflows

Detailed workflow guidance for different use cases.

## Pre-Commit Review

**Goal**: Understand what changes affect before committing.

### Steps

1. **Run impact detection**
   ```
   noodlbox_detect_impact(repository: "current", change_scope: "staged")
   ```

2. **Check scale**
   - `changed_symbols_count` < 5 → Continue inline
   - `changed_symbols_count` >= 5 → Consider splitting

3. **Review changed symbols**
   - Are these the symbols you intended to change?
   - Any unexpected modifications?

4. **Review impacted processes**
   - Are all affected flows related to your change?
   - Any surprising cross-module impact?

5. **Assess risk**
   - Low: < 10 processes, single module
   - Medium: 10-30 processes, 1-2 modules
   - High: > 30 processes, multiple modules

6. **Decision**
   - Low/Medium: Proceed with commit
   - High: Consider splitting into smaller commits

### Checklist

```
Pre-Commit Review:
- [ ] Run impact detection with scope: "staged"
- [ ] Review changed_symbols list
- [ ] Check total_impacted_processes count
- [ ] Verify all impacts are intentional
- [ ] Assess risk level
- [ ] Split commit if high impact
```

## Code Review

**Goal**: Thoroughly understand a PR's impact for review.

### Steps

1. **Run impact detection**
   ```
   noodlbox_detect_impact(
     repository: "current",
     change_scope: "compare",
     base_ref: "main"  # or target branch
   )
   ```

2. **Check summary**
   - How many files changed?
   - How many symbols modified?
   - Total processes affected?

3. **Review cross-module impact**
   - Changes crossing community boundaries?
   - Requires coordination with other teams?

4. **Verify test coverage**
   - Are impacted processes covered by tests?
   - Do tests need updating?

5. **Use include_content for critical symbols**
   ```
   noodlbox_detect_impact(
     repository: "current",
     change_scope: "compare",
     base_ref: "main",
     include_content: true  # See actual code
   )
   ```

### Checklist

```
Code Review:
- [ ] Run impact detection with scope: "compare"
- [ ] Review changed_files list
- [ ] Check cross-community impacts
- [ ] Verify test coverage for impacted areas
- [ ] Flag high-centrality symbol changes
- [ ] Document coordination needs
- [ ] Use include_content for critical changes
```

## Refactoring Planning

**Goal**: Understand blast radius before refactoring.

### Steps

1. **Run impact detection**
   ```
   noodlbox_detect_impact(repository: "current", change_scope: "all")
   ```

2. **Focus on scope**
   - `total_impacted_symbols` is your blast radius
   - Check which communities are affected

3. **Identify high-centrality impacts**
   - Changes to high-centrality symbols ripple widely
   - Consider refactoring in stages

4. **Plan splitting strategy**
   - Can you isolate changes by module?
   - Identify natural breaking points

5. **Use pagination for large impact**
   ```
   noodlbox_detect_impact(
     repository: "current",
     change_scope: "all",
     max_processes: 20,
     page: 1
   )
   ```

### Checklist

```
Refactoring Planning:
- [ ] Run impact detection with scope: "all"
- [ ] Note total_impacted_symbols (blast radius)
- [ ] Identify affected communities
- [ ] Flag high-centrality symbol changes
- [ ] Plan incremental refactoring stages
- [ ] Use pagination to review all processes
```

## Debugging

**Goal**: Trace how recent changes might have introduced bugs.

### Steps

1. **Run impact detection**
   ```
   noodlbox_detect_impact(repository: "current", change_scope: "all")
   ```

2. **Focus on changed symbols**
   - One of these likely introduced the bug

3. **Trace impacted processes**
   - For each changed symbol, check its processes
   - Look for execution paths to the buggy behavior

4. **Use include_content**
   ```
   noodlbox_detect_impact(
     repository: "current",
     change_scope: "all",
     include_content: true
   )
   ```

5. **Check step_index**
   - Understand execution order in affected processes
   - Identify where in the flow the bug manifests

6. **Focus on high-centrality changes**
   - High-centrality symbols affect more code
   - More likely to be the culprit

### Checklist

```
Debugging:
- [ ] Run impact detection with scope: "all"
- [ ] List changed_symbols as suspects
- [ ] Trace impacted_processes for each suspect
- [ ] Use include_content to see actual changes
- [ ] Check step_index for execution order
- [ ] Prioritize high-centrality symbols
```

## Interpreting Results

### Response Structure

```json
{
  "summary": {
    "changed_files_count": 3,
    "changed_symbols_count": 5,
    "total_impacted_processes": 12,
    "total_impacted_symbols": 45
  },
  "changed_symbols": [
    {
      "name": "validatePayment",
      "file_path": "src/payments/validator.ts",
      "line": 42,
      "kind": "Function",
      "centrality": 0.85
    }
  ],
  "impacted_processes": [
    {
      "id": "proc_123",
      "label": "Checkout flow",
      "steps_affected": 5,
      "entry_point": "handleCheckout"
    }
  ]
}
```

### Key Metrics

| Metric | Meaning |
|--------|---------|
| `changed_symbols_count` | Direct changes you made |
| `total_impacted_processes` | Execution flows affected |
| `total_impacted_symbols` | All symbols in affected flows |
| `centrality` | Symbol importance (0-1, higher = more connected) |
| `steps_affected` | How many steps in process include changed code |
