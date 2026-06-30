---
title: AGENTS.md
description: Write this content to your project's AGENTS.md file to enable Noodlbox integration.
---

# Noodlbox

Use the `noodl` CLI for semantic code exploration through the local knowledge graph.

## First Step: Run Analyze

Before using graph commands, make sure the repository is analyzed:

```
noodl analyze .
```

Use `noodl list` to see analyzed boxes and `noodl status` to inspect the current box.

## Core Concepts

| Term | Meaning |
|------|---------|
| **Community** | Cluster of tightly-coupled symbols (functional module) |
| **Process** | Workflow trace from entry point through call chain |
| **Centrality** | Symbol importance - high means many callers/callees |

## CLI Commands

| Command | Purpose |
|---|---|
| `noodl analyze [path]` | Analyze a box and build the knowledge graph |
| `noodl list` | List analyzed boxes |
| `noodl status` | Show current box and graph status |
| `noodl resource map` | Show codebase communities and workflows |
| `noodl resource map community <id>` | Show one community in detail |
| `noodl resource map workflow <id>` | Show one workflow trace |
| `noodl search "<query>"` | Natural-language search over local code |
| `noodl query "<cypher>"` | Execute a Cypher query |
| `noodl def <name-or-uid>` | Get 360-degree symbol context |
| `noodl diff` | Working-tree graph diff (uncommitted changes vs HEAD) |
| `noodl rename <old> <new>` | Preview a coordinated rename; add `--apply` to write |
| `noodl hub search <box> "<query>"` | Search an external package box |
| `noodl hub query <box> "<cypher>"` | Query an external package box |

## Best Practices

- Start with `noodl resource map` when unfamiliar with a codebase.
- Use `noodl def <symbol>` when a symbol name is known.
- Use `noodl search "<query>"` when the concept is known but the symbol is not.
- Check `noodl diff` before committing changes.
- Use `--format json` when another tool or script needs structured output.
