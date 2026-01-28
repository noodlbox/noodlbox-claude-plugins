---
name: setup-noodlbox
description: Set up noodlbox MCP context for this project
---

# Set Up Noodlbox

Initialize noodlbox context for this Claude Code project.

## Instructions

1. Read the `setup://` MCP resource to get noodlbox context
2. Check if `CLAUDE.md` exists at project root
3. **If CLAUDE.md does not exist**: Create it with the setup:// content
4. **If CLAUDE.md exists**: Append the noodlbox section:
   - Add a blank line
   - Add `<!-- noodlbox:start -->`
   - Add the setup:// content
   - Add `<!-- noodlbox:end -->`

## Output

Confirm success:
- If created: `Created CLAUDE.md with noodlbox MCP context.`
- If updated: `Added noodlbox section to existing CLAUDE.md.`
