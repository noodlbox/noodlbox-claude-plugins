# Noodlbox Plugin for Claude Code

Code knowledge graph analysis for Claude Code - explore codebases, trace call chains, and analyze refactoring impact.

## Installation

```bash
claude plugin marketplace add noodlbox/noodlbox-claude-plugins
claude plugin install noodlbox@noodlbox
```

## Features

### Skills + CLI
Guides Claude Code to use the `noodl` CLI for knowledge graph queries.

**Capabilities:**
- Commands: Cypher queries, semantic search, impact detection, symbol context
- Resources: Codebase maps via `noodl resource map`
- Hooks: Search augmentation and session context

### Skills
- **Exploration workflows** - Systematic codebase discovery
- **Debugging guides** - Trace issues through call chains
- **Refactoring analysis** - Understand impact before changes

### Slash Commands
- `/noodlbox:setup-noodlbox` - Set up noodlbox CLI context for the project

## Prerequisites

1. Install noodlbox CLI: https://docs.noodlbox.io/getting-started/installation
2. Analyze your repository: `noodl analyze /path/to/repo`

The plugin uses CLI-first workflows by default.

## Documentation

- [Getting Started](https://docs.noodlbox.io/getting-started)
- [CLI Setup](https://docs.noodlbox.io/getting-started)
- [Workflows](https://docs.noodlbox.io/workflows)

## License

MIT
