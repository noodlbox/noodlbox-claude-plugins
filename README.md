# Noodlbox Plugin for Claude Code

Code knowledge graph analysis for Claude Code - explore codebases, trace call chains, and analyze refactoring impact.

## Installation

```bash
claude plugin marketplace add noodlbox/noodlbox-claude-plugins
claude plugin install noodlbox@noodlbox
```

## Features

### MCP Server
Connects to the noodlbox MCP server for knowledge graph queries.

### Skills
- **Exploration workflows** - Systematic codebase discovery
- **Debugging guides** - Trace issues through call chains
- **Refactoring analysis** - Understand impact before changes

### Slash Commands
- `/noodlbox:generate_map` - Generate architecture map with mermaid diagram
- `/noodlbox:detect_impact` - Analyze git changes impact
- `/noodlbox:init` - Initialize human-readable labels (experimental)

## Prerequisites

1. Install noodlbox CLI: https://docs.noodlbox.io/getting-started/installation
2. Analyze your repository: `noodl analyze /path/to/repo`

The MCP server is launched automatically by Claude Code.

## Documentation

- [Getting Started](https://docs.noodlbox.io/getting-started)
- [MCP Setup](https://docs.noodlbox.io/getting-started/setup-mcp)
- [Workflows](https://docs.noodlbox.io/workflows)

## License

MIT
