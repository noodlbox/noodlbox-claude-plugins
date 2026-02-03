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
| **Process** | Execution flow from entry point through call chain |
| **Centrality** | Symbol importance - high means many callers/callees |

## MCP Tools

- `noodlbox_analyze` - Analyze a repository and create a knowledge graph
- `noodlbox_delete` - Delete an analyzed repository from Noodlbox
- `noodlbox_raw_cypher_query` - Execute targeted Cypher queries on the knowledge graph
- `noodlbox_query_with_context` - Natural language search returning processes
- `noodlbox_search_documents` - Search documentation with semantic/hybrid search
- `noodlbox_detect_impact` - Analyze git changes blast radius

## MCP Resources

- `repository://list` - List of available repositories
- `db://schema/{repository}` - Database schema for a repository
- `map://{repository}` - Codebase overview map
- `map://{repository}/community/{id}` - Community detail view
- `map://{repository}/process/{id}` - Process execution trace

## Best Practices

- Start with `map://{repository}` when unfamiliar with a codebase
- Use `limit: 3-5` initially, increase only if needed
- Check `noodlbox_detect_impact` before committing changes
