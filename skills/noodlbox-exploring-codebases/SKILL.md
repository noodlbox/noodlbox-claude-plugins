---
name: noodlbox-exploring-codebases
description: >-
  Explore codebase, understand architecture, find how things work. Navigate
  unfamiliar repositories, discover code structure, find where functionality
  lives by intent rather than exact text. NOT for debugging failures (use
  debugging) or checking change impact (use change-planning).
metadata:
  author: noodlbox
  version: "{{VERSION}}"
---

# Exploring Codebases

Semantic code exploration that returns **processes** (execution flows) instead of isolated file matches.

## Quick Start

```
1. READ map://current              → Get codebase overview (~200 tokens)
2. READ map://current/community/{id} → Drill into relevant module
3. noodlbox_query_with_context     → Search for specific concepts
```

## Workflow Checklist

Copy and track progress:

```
Exploration Progress:
- [ ] Read map overview
- [ ] Identify relevant community
- [ ] Drill into community detail
- [ ] Search for specific symbols
- [ ] Read source files
```

## Tool Reference

### noodlbox_query_with_context

Semantic search returning processes ranked by relevance.

```
noodlbox_query_with_context(
  repository: "current",
  q: "payment validation",
  task_context: "exploring payment system",
  current_goal: "understand validation flow",
  search_intention: "find entry points",
  limit: 5,
  max_symbols: 10
)
```

**Output structure**:
```
Process: "Payment validation starting with validatePayment"
├── validatePayment (src/payments/validator.ts:42) ← matched
├── checkAmount (src/payments/validator.ts:78)
├── verifyCard (src/payments/card.ts:15)
└── processTransaction (src/payments/processor.ts:23)
```

**Start with `limit: 3-5`**. Increase only if needed.

## Resources

### map://current

Codebase overview with communities, stats, and cross-flows.

```
repository: my-project
stats: { communities: 15, symbols: 2400, processes: 890 }
communities:
  - id: abc123, label: PaymentProcessing, symbols: 47
  - id: def456, label: UserAuthentication, symbols: 32
cross_flows:
  - from: PaymentProcessing, to: UserAuthentication, calls: 12
```

**Token cost**: ~200 tokens. Read first when unfamiliar with codebase.

### map://current/community/{id}

Community detail with symbols ranked by importance.

```
id: abc123
label: PaymentProcessing
symbols:
  - name: validatePayment, centrality: 0.92, file: src/payments/validator.ts
  - name: processCharge, centrality: 0.78, file: src/payments/processor.ts
entry_points:
  - name: handlePaymentRequest, callers: [APIGateway, WebhookHandler]
processes:
  - id: xyz789, label: "Payment validation flow"
```

**Token cost**: ~500 tokens. Use after identifying relevant community.

### map://current/process/{id}

Full execution trace with file paths and line numbers.

**Use when**: Need complete call chain for a specific flow.

## Concepts

| Term | Meaning |
|------|---------|
| **Community** | Cluster of tightly-coupled symbols (functional module) |
| **Process** | Execution flow from entry point through call chain |
| **Centrality** | Symbol importance - high means many callers/callees |
| **Entry point** | Symbol called from outside its community |

## Example: Explore Authentication

**Task**: "How does authentication work in this codebase?"

```
Step 1: Get overview
READ map://current

→ See "UserAuthentication" community (32 symbols, high cohesion)

Step 2: Drill into auth community
READ map://current/community/{auth-id}

→ Key symbols: login, validateToken, refreshSession
→ Entry points: handleLoginRequest, authMiddleware
→ Process: "Login flow starting with validateCredentials"

Step 3: Search for specifics
noodlbox_query_with_context(q: "token validation", limit: 3)

→ Focused results from the auth area
→ Each symbol has file_path and line numbers

Step 4: Read source
Read src/auth/token.ts
```

**Checklist for this example**:
```
- [x] Read map overview
- [x] Identify relevant community (UserAuthentication)
- [x] Drill into community detail
- [x] Search for specific symbols (token validation)
- [x] Read source files (token.ts)
```

## When to Use Something Else

| Need | Use Instead |
|------|-------------|
| Check change impact | change-planning skill |
| Debug failing code | debugging skill |
| Plan refactoring | refactoring skill |
| Find exact string | Grep (faster for literal matches) |
| Read specific file | Read tool directly |
