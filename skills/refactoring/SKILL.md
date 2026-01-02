---
name: refactoring
description: >-
  Refactor code, rename symbols, extract modules, split services. Plan safe
  refactoring by mapping dependencies, find what depends on code before moving
  or deprecating APIs. NOT for quick change impact (use change-planning) or
  debugging failures (use debugging).
metadata:
  author: noodlbox
  version: "{{VERSION}}"
---

# Refactoring

Plan and execute safe refactoring by understanding dependencies and impact.

## Quick Start

```
1. noodlbox_query_with_context  → Find the code to refactor
2. noodlbox_raw_cypher_query   → Map all dependencies
3. noodlbox_detect_impact      → Preview blast radius
```

## Tool Reference

### noodlbox_query_with_context

Find code related to the refactoring target.

```
noodlbox_query_with_context(
  repository: "current",
  q: "payment processing service",
  task_context: "planning to split PaymentService",
  current_goal: "find all payment-related code",
  search_intention: "map dependencies before refactor",
  limit: 10
)
```

### noodlbox_raw_cypher_query

Map dependencies for safe refactoring.

```cypher
-- Find all callers (what depends on this?)
MATCH (caller)-[:CALLS]->(target:CODE_SYMBOL {name: "PaymentService"})
RETURN caller.name, caller.file_path, caller.community_id
ORDER BY caller.community_id

-- Find all callees (what does this depend on?)
MATCH (source:CODE_SYMBOL {name: "PaymentService"})-[:CALLS]->(callee)
RETURN callee.name, callee.file_path
ORDER BY callee.name

-- Find symbols that would need updating after rename
MATCH (s:CODE_SYMBOL)
WHERE s.name CONTAINS "Payment"
RETURN s.name, s.kind, s.file_path
ORDER BY s.file_path
```

For more Cypher patterns, see [shared/cypher-patterns.md](../shared/cypher-patterns.md).

### noodlbox_detect_impact

Preview what would be affected by the refactor.

```
noodlbox_detect_impact(
  repository: "current",
  change_scope: "all",
  include_content: false,
  max_processes: 20
)
```

## Workflow Checklist

### Rename a Symbol

```
Rename Refactoring:
- [ ] Find all references to the symbol
- [ ] Check for string literals using the name
- [ ] Identify test files that reference it
- [ ] Check for external API surface changes
- [ ] Plan rename order (interfaces → implementations → usages)
- [ ] Verify no dynamic references (reflection, string keys)
```

### Extract Module

```
Extract Module Refactoring:
- [ ] Identify code to extract
- [ ] Map all internal dependencies
- [ ] Map all external callers
- [ ] Define new module interface
- [ ] Plan extraction order
- [ ] Update imports across codebase
```

### Split Service

```
Split Service Refactoring:
- [ ] Map current service responsibilities
- [ ] Group related methods by domain
- [ ] Identify shared state/dependencies
- [ ] Define new service boundaries
- [ ] Plan migration path
- [ ] Create facade for backwards compatibility (if needed)
```

## Example: Rename getUserById to findUserById

**Task**: "I want to rename getUserById to findUserById. What needs to change?"

```
Step 1: Find all references
noodlbox_raw_cypher_query(
  repository: "current",
  cypher: "MATCH (caller)-[:CALLS]->(fn:CODE_SYMBOL {name: 'getUserById'}) RETURN caller.name, caller.file_path"
)

→ Results:
  AuthService.validateToken (src/auth/service.ts:45)
  ProfileController.getProfile (src/profile/controller.ts:23)
  OrderService.getOrderOwner (src/orders/service.ts:78)
  UserController.show (src/users/controller.ts:34)

Step 2: Find the definition
noodlbox_raw_cypher_query(
  repository: "current",
  cypher: "MATCH (fn:CODE_SYMBOL {name: 'getUserById'}) RETURN fn.file_path, fn.kind"
)

→ Results:
  UserService (src/users/service.ts) - Method
  UserRepository (src/users/repository.ts) - Method

Step 3: Check for tests
noodlbox_query_with_context(
  repository: "current",
  q: "getUserById test spec",
  task_context: "finding tests for getUserById",
  limit: 5
)

→ Results:
  user.service.spec.ts
  user.repository.spec.ts

Step 4: Create rename plan
Files to update:
1. src/users/service.ts (definition)
2. src/users/repository.ts (definition)
3. src/auth/service.ts (caller)
4. src/profile/controller.ts (caller)
5. src/orders/service.ts (caller)
6. src/users/controller.ts (caller)
7. src/users/service.spec.ts (test)
8. src/users/repository.spec.ts (test)
```

**Checklist for this example**:
```
- [x] Find all references (4 callers)
- [x] Find definitions (2 files)
- [x] Check for tests (2 test files)
- [ ] Check for string literals (grep for "getUserById")
- [ ] Check external API (not exposed)
- [x] Plan rename order
```

## Example: Split PaymentService

**Task**: "Can I split PaymentService into separate services? Show dependencies."

```
Step 1: Understand current structure
noodlbox_query_with_context(
  repository: "current",
  q: "PaymentService methods responsibilities",
  task_context: "planning to split payment service",
  current_goal: "map all payment functionality",
  limit: 10
)

→ Results:
  PaymentService methods:
  ├── processPayment
  ├── refundPayment
  ├── validateCard
  ├── calculateFees
  ├── sendReceipt
  └── generateReport

Step 2: Map internal dependencies
noodlbox_raw_cypher_query(
  repository: "current",
  cypher: "MATCH (m)-[:CALLS]->(n) WHERE m.file_path CONTAINS 'payment' AND n.file_path CONTAINS 'payment' RETURN m.name, n.name"
)

→ Results:
  processPayment → validateCard
  processPayment → calculateFees
  refundPayment → calculateFees
  processPayment → sendReceipt

Step 3: Map external callers
noodlbox_raw_cypher_query(
  repository: "current",
  cypher: "MATCH (caller)-[:CALLS]->(fn:CODE_SYMBOL) WHERE fn.file_path CONTAINS 'payment/service' AND NOT caller.file_path CONTAINS 'payment' RETURN DISTINCT caller.name, fn.name, caller.file_path"
)

→ Results:
  CheckoutHandler → processPayment
  WebhookHandler → processPayment
  AdminController → refundPayment
  ReportJob → generateReport

Step 4: Suggest split
Based on dependencies:
- PaymentProcessingService: processPayment, validateCard, calculateFees
- PaymentNotificationService: sendReceipt
- PaymentReportService: generateReport
- PaymentRefundService: refundPayment, calculateFees (shared)
```

## Refactoring Patterns

| Goal | Approach |
|------|----------|
| Rename symbol | Find all callers + definition + tests |
| Extract function | Check it's called from one place, verify no side effects |
| Extract module | Map internal deps, define interface, update imports |
| Split service | Group by domain, map cross-dependencies, plan migration |
| Deprecate API | Find all callers, provide migration path, add warnings |
| Move file | Update all imports, check for relative path references |

## Risk Assessment

| Metric | Low Risk | Medium Risk | High Risk |
|--------|----------|-------------|-----------|
| Callers count | < 5 | 5-20 | > 20 |
| Cross-community callers | 0 | 1-2 | > 2 |
| External API change | No | Deprecation | Breaking |
| Shared state | None | Read-only | Mutable |

## When to Use Something Else

| Need | Use Instead |
|------|-------------|
| Quick change impact | change-planning skill |
| Explore unfamiliar code | exploring-codebases skill |
| Debug failing code | debugging skill |
| Generate documentation | generating-documentation skill |
