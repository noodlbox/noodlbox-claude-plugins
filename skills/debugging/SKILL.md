---
name: debugging
description: >-
  Helps investigate and fix bugs by tracing execution paths and finding root causes.
  Ideal for understanding why code fails, tracing error origins, or investigating
  unexpected behavior. Triggers include "why is this failing", "debug this error",
  "trace the bug", "troubleshoot", "find root cause", "why does X return wrong value".
metadata:
  author: noodlbox
  version: "{{VERSION}}"
---

# Debugging

Investigate bugs by understanding code relationships and tracing execution paths.

## Quick Start

```
1. noodlbox_query_with_context  → Find code related to the error
2. READ map://current/process/{id} → Trace execution flow
3. noodlbox_raw_cypher_query   → Find callers/callees of suspect code
```

## Tool Reference

### noodlbox_query_with_context

Find code semantically related to the error or symptom.

```
noodlbox_query_with_context(
  repository: "current",
  q: "payment validation error handling",
  task_context: "debugging payment failures",
  current_goal: "find where validation errors originate",
  search_intention: "trace error path",
  limit: 5,
  max_symbols: 10
)
```

### noodlbox_detect_impact

Find what recent changes might have introduced the bug.

```
noodlbox_detect_impact(
  repository: "current",
  change_scope: "all",
  include_content: true
)
```

### noodlbox_raw_cypher_query

Trace callers and callees of suspect functions.

```cypher
-- Who calls the failing function?
MATCH (caller)-[:CALLS]->(target:CODE_SYMBOL {name: "validatePayment"})
RETURN caller.name, caller.file_path LIMIT 20

-- What does the failing function call?
MATCH (source:CODE_SYMBOL {name: "validatePayment"})-[:CALLS]->(target)
RETURN target.name, target.file_path LIMIT 20
```

For more Cypher patterns, see [shared/cypher-patterns.md](../shared/cypher-patterns.md).

## Workflow Checklist

### Investigate a Bug

```
Bug Investigation:
- [ ] Understand the symptom (error message, unexpected behavior)
- [ ] Search for related code with query_with_context
- [ ] Identify the failing function/component
- [ ] Trace callers to find entry points
- [ ] Trace callees to find dependencies
- [ ] Check recent changes with detect_impact
- [ ] Read source files for root cause
- [ ] Form hypothesis and verify
```

## Example: Debug Payment Failure

**Task**: "The payment endpoint returns a 500 error intermittently"

```
Step 1: Find payment-related error handling
noodlbox_query_with_context(
  repository: "current",
  q: "payment error handling exception",
  task_context: "debugging intermittent 500 errors",
  current_goal: "find error handling code",
  limit: 5
)

→ Results:
  Process: "Payment validation flow"
  ├── validatePayment (src/payments/validator.ts:42)
  ├── handlePaymentError (src/payments/errors.ts:15)
  └── PaymentException (src/payments/exceptions.ts:8)

Step 2: Trace who calls validatePayment
noodlbox_raw_cypher_query(
  repository: "current",
  cypher: "MATCH (caller)-[:CALLS]->(fn:CODE_SYMBOL {name: 'validatePayment'}) RETURN caller.name, caller.file_path"
)

→ Results:
  processCheckout (src/checkout/handler.ts)
  webhookHandler (src/webhooks/payment.ts)

Step 3: Check what validatePayment calls
noodlbox_raw_cypher_query(
  repository: "current",
  cypher: "MATCH (fn:CODE_SYMBOL {name: 'validatePayment'})-[:CALLS]->(callee) RETURN callee.name, callee.file_path"
)

→ Results:
  verifyCardExpiry (src/payments/card.ts)
  checkAmount (src/payments/validator.ts)
  fetchRates (src/external/currency.ts)  ← External call!

Step 4: Hypothesis
fetchRates calls external API → intermittent failures
Read src/external/currency.ts to verify error handling

Step 5: Root cause found
fetchRates doesn't handle timeout properly
```

**Checklist for this example**:
```
- [x] Understand symptom (500 error, intermittent)
- [x] Search for related code (payment error handling)
- [x] Identify failing component (validatePayment flow)
- [x] Trace callers (processCheckout, webhookHandler)
- [x] Trace callees (fetchRates - external API)
- [x] Form hypothesis (external API timeout)
- [x] Read source (currency.ts - missing timeout handling)
```

## Debugging Patterns

| Symptom | Approach |
|---------|----------|
| Error message | Search for error text, trace throw sites |
| Wrong return value | Trace data flow through callees |
| Intermittent failure | Look for external calls, race conditions |
| Performance issue | Find hot paths via centrality |
| Recent regression | Use detect_impact to find recent changes |

## When to Use Something Else

| Need | Use Instead |
|------|-------------|
| Explore unfamiliar code | exploring-codebases skill |
| Plan safe changes | change-planning skill |
| Large refactoring | refactoring skill |
| Generate documentation | generating-documentation skill |
