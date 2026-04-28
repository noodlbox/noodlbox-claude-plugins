---
title: AGENTS.md
description: Write this content to your project's AGENTS.md file to enable Noodlbox integration.
---

# Noodlbox

You have access to the Noodlbox MCP server for semantic code exploration through a knowledge graph.

## First Step: Run Analyze

Before using any Noodlbox tools, the repository must be analyzed:

```
noodlbox_analyze(path: "/path/to/repository")
```

Check `repository://list` to see if a repository is already indexed.

## Core Concepts

| Term | Meaning |
|------|---------|
| **Community** | Cluster of tightly-coupled symbols (functional module) |
| **Process** | Workflow trace from entry point through call chain |
| **Centrality** | Symbol importance - high means many callers/callees |

## MCP Tools

- `noodlbox_analyze` - Analyze a repository and create a knowledge graph
- `noodlbox_delete` - Delete an analyzed repository from Noodlbox
- `noodlbox_query` - Execute Cypher queries on your local knowledge graph
- `noodlbox_search` - Natural language search on your local codebase
- `noodlbox_search_context_hub` - Search external packages (npm, pypi, github) with on-demand analysis
- `noodlbox_query_context_hub` - Execute Cypher queries on external packages with on-demand analysis
- `noodlbox_detect_impact` - Analyze git changes blast radius
- `noodlbox_definition_context` - Get 360° symbol context (definition, references, community, workflows)
- `noodlbox_rename_symbol` - Rename a symbol across the codebase

## MCP Resources

- `repository://list` - List of available repositories
- `db://schema/{repository}` - Database schema for a repository
- `map://{repository}` - Codebase overview map
- `map://{repository}/community/{id}` - Community detail view
- `map://{repository}/workflows/{id}` - Workflow trace

## CLI equivalents (when MCP is unavailable)

Every MCP tool has a `noodl` CLI peer that emits the same JSON shape via `--format json`:

| MCP tool | CLI command |
|---|---|
| `noodlbox_analyze` | `noodl analyze <path>` |
| `noodlbox_delete` | `noodl delete <box>` |
| `noodlbox_query` | `noodl query <cypher>` |
| `noodlbox_search` | `noodl search "<query>"` |
| `noodlbox_search_context_hub` | `noodl hub search <box> "<query>"` |
| `noodlbox_query_context_hub` | `noodl hub query <box> <cypher>` |
| `noodlbox_detect_impact` | `noodl impact` |
| `noodlbox_definition_context` | `noodl def <name-or-uid>` |
| `noodlbox_rename_symbol` | `noodl rename <old> <new>` (dry-run by default; `--apply` to write) |

Agents running without MCP can pipe `noodl <cmd> --format json` into `jq` and parse the same fields. See `noodl <cmd> --help` for flags.

## Best Practices

- Start with `map://{repository}` when unfamiliar with a codebase
- Use `limit: 3-5` initially, increase only if needed
- Check `noodlbox_detect_impact` (or `noodl impact`) before committing changes
