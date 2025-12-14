# Noodlbox Plugin for Claude Code

Code knowledge graph analysis for Claude Code - explore codebases, trace call chains, and analyze refactoring impact.

## Installation

```
/plugin marketplace add noodlbox/noodlbox-claude-plugin
/plugin install noodlbox@noodlbox
```

## Features

### MCP Server
Connects to the noodlbox MCP server for knowledge graph queries.

### Skills
- **Exploration workflows** - Systematic codebase discovery
- **Debugging guides** - Trace issues through call chains
- **Refactoring analysis** - Understand impact before changes

### Slash Commands
- `/generate_map` - Generate architecture map with mermaid diagram
- `/trace_feature` - Trace execution flow from a symbol
- `/detect_impact_of_current_changes` - Analyze git changes impact

## Prerequisites

1. Install noodlbox CLI: https://docs.noodlbox.io/getting-started/installation
2. Analyze your repository: `noodl analyze /path/to/repo`
3. Start the MCP server: `noodl mcp`

## Documentation

- [Getting Started](https://docs.noodlbox.io/getting-started)
- [MCP Setup](https://docs.noodlbox.io/getting-started/setup-mcp)
- [Workflows](https://docs.noodlbox.io/workflows)

## License

MIT
