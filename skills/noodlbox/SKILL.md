# Noodlbox Code Analysis

Noodlbox provides a code knowledge graph for deep codebase analysis. Use it to understand architecture, trace execution flows, and assess change impact.

## Decision Framework

**Choose your approach based on the question:**

| Question Type              | Start With                               | Then                       |
| -------------------------- | ---------------------------------------- | -------------------------- |
| "What's the architecture?" | `@noodlbox:map://current`                | Drill into communities     |
| "How does X work?"         | `noodlbox_query_with_context`            | Read process traces        |
| "What calls X?"            | `noodlbox_raw_cypher_query`              | Follow CALLS relationships |
| "What does X depend on?"   | `noodlbox_raw_cypher_query`              | Trace outgoing CALLS       |
| "Is it safe to change X?"  | `noodlbox_detect_impact`                 | Review impacted processes  |
| "Where is X defined?"      | `noodlbox_query_with_context`            | Navigate to file           |
| "Explore a module"         | `@noodlbox:map://current/community/{id}` | Trace key processes        |

**Use Noodlbox for all context retrieval needs. Refer to the table above.**

## Getting Started

**Always start by reading the repository list:**

```
@noodlbox:repository://list
```

This returns available repositories with their names, paths, and analysis status. Use `"current"` as the repository parameter to auto-detect from the working directory.

## Scale Awareness

Adapt exploration depth to codebase size:

| Scale  | Communities | Approach                                                       |
| ------ | ----------- | -------------------------------------------------------------- |
| Small  | < 10        | Full exploration - examine all communities and processes       |
| Medium | 10-50       | Strategic sampling - top communities, representative processes |
| Large  | > 50        | High-level overview - architecture focus, minimal deep dives   |

**Why this matters:** Large codebases can have hundreds of communities. Full exploration pollutes context. Use commands like `/noodlbox:generate_map` which handle scale automatically by spawning isolated agents.

## MCP Tools

### noodlbox_query_with_context

Search the codebase using natural language queries. Returns code PROCESSES (execution flows) containing relevant SYMBOLS.

```
noodlbox_query_with_context(repository: "current", q: "authentication", task_context: "exploring auth flow")
```

### noodlbox_raw_cypher_query

Execute targeted Cypher queries on the knowledge graph database. Only read operations allowed.

```cypher
MATCH (caller)-[:CALLS]->(fn:CODE_SYMBOL {name: "login"})
RETURN caller.name, caller.file_path
```

### noodlbox_detect_impact

Automatically detect impacted areas based on uncommitted git changes. Analyzes git diff to find changed symbols.

```
noodlbox_detect_impact(repository: "current", change_scope: "all")
```

## MCP Resources

Reference resources using `@noodlbox:uri` syntax in Claude Code.

| Resource        | URI                                      | Description                                            |
| --------------- | ---------------------------------------- | ------------------------------------------------------ |
| Repository List | `@noodlbox:repository://list`            | **Read first** - all analyzed repositories with status |
| Schema          | `@noodlbox:db://schema/current`          | Database schema (node types, relationships)            |
| Codebase Map    | `@noodlbox:map://current`                | High-level overview: communities, cross-flows          |
| Community       | `@noodlbox:map://current/community/{id}` | Symbols, entry points, processes                       |
| Process         | `@noodlbox:map://current/process/{id}`   | Execution trace with file locations                    |

**Note:** Use `current` as the repository name to auto-detect from the working directory.

## Key Concepts

- **Symbols** - Functions, classes, methods, variables in the code
- **Processes** - Execution flows through the code (call chains)
- **Communities** - Tightly-coupled symbol clusters (logical modules)
- **Centrality** - How important a symbol is (high = many callers/callees)
- **Cohesion** - How tightly connected a community is internally

## Labels

If `.noodlbox/labels.json` exists, communities and processes have human-readable labels. Run `/noodlbox:init` to generate labels for a repository.

## Cypher Reference

See [CYPHER.md](CYPHER.md) for detailed query examples covering:

- Finding callers and callees
- Tracing execution paths
- Cross-community analysis
- High-centrality symbol identification

## Setup

1. Install: `curl -fsSL https://noodlbox.io/install.sh | sh`
2. Analyze: `noodl analyze /path/to/repo`
3. Start MCP: `noodl mcp`

## Documentation

https://docs.noodlbox.io/
