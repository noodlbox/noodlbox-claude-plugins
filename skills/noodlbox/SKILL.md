# Noodlbox Code Analysis

Noodlbox provides a code knowledge graph for deep codebase analysis.

## Getting Started

**Always start by reading the repository list to get context:**
```
@noodlbox:repository://list
```

This returns available repositories with their names, paths, and analysis status. Use `"current"` as the repository parameter to auto-detect from the working directory.

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

| Resource | URI | Description |
|----------|-----|-------------|
| Repository List | `@noodlbox:repository://list` | **Read first** - all analyzed repositories with status |
| Schema | `@noodlbox:db://schema/current` | Database schema (node types, relationships) |
| Codebase Map | `@noodlbox:map://current` | High-level overview: communities, cross-flows |
| Community | `@noodlbox:map://current/community/{id}` | Symbols, entry points, processes |
| Process | `@noodlbox:map://current/process/{id}` | Execution trace with file locations |

**Note:** Use `current` as the repository name to auto-detect from the working directory. Alternatively, use the exact repository name from `@noodlbox:repository://list`.

## Workflow Pattern

1. **Get context first**: Read `@noodlbox:repository://list` to see available repos
2. **Get the map**: Read `@noodlbox:map://current` for architecture overview
3. **Search or query**: Use tools based on the task
4. **Drill down**: Read community/process resources as needed

## When to Use Noodlbox

| Question | Approach |
|----------|----------|
| "How does X work?" | `noodlbox_query_with_context` to find relevant processes |
| "What calls this function?" | `noodlbox_raw_cypher_query` for incoming CALLS |
| "What does X depend on?" | `noodlbox_raw_cypher_query` for outgoing CALLS |
| "Is it safe to refactor X?" | `noodlbox_detect_impact` to see affected code |
| "Where is X defined?" | `noodlbox_query_with_context` to search |
| "What's the architecture?" | Read `@noodlbox:map://current` resource |
| "Explore a module" | Read `@noodlbox:map://current/community/{id}` |

## Detailed Guides

See [WORKFLOWS.md](WORKFLOWS.md) for detailed workflow guides:
- Code Exploration
- Debugging
- Refactoring
- Impact Analysis

See [CYPHER.md](CYPHER.md) for example queries.

## Setup

1. Install the Noodlbox CLI: `curl -fsSL https://noodlbox.io/install.sh | sh`
2. Analyze your repository: `noodl analyze /path/to/repo`
3. Start the MCP server: `noodl mcp`

## Documentation

https://docs.noodlbox.io/
