---
description: Initialize Noodlbox labels for communities and processes
argument-hint: [repository]
---

# Initialize Noodlbox Labels

Create human-readable labels for all communities and processes in the codebase. Labels are stored in `.noodlbox/labels.json` and used by other Noodlbox commands.

## Step 1: Read Map Overview

Get the complete map of the repository:

```
@noodlbox:map://$ARGUMENTS
```

Extract:
- All community IDs with their key symbols and file paths
- Process counts per community
- Current auto-generated labels

## Step 2: Assess Scale

| Communities | Strategy |
|-------------|----------|
| < 20 | Process all in single labeller agent |
| 20-100 | Batch into groups of 15, run labellers in parallel |
| > 100 | Batch into groups of 20, prioritize largest communities |

## Step 3: Spawn Labeller Agents

For each batch of communities, spawn a labeller agent:

```
Task tool with labeller agent:
- Input: Batch of communities with their symbols and file paths
- Task: Generate labels and descriptions for communities and their key processes
- Output: JSON with labels
```

**For parallel execution:** Spawn multiple labeller agents simultaneously for different batches.

## Step 4: Collect and Merge Results

Aggregate all labeller outputs into a unified structure:

```json
{
  "version": "1.0",
  "repository": "$ARGUMENTS",
  "generated_at": "ISO timestamp",
  "communities": { ... all community labels ... },
  "processes": { ... all process labels ... }
}
```

## Step 5: Write Labels File

Create `.noodlbox/` directory if it doesn't exist, then write `labels.json`:

```
.noodlbox/
└── labels.json
```

### Labels File Format

```json
{
  "version": "1.0",
  "repository": "my-project",
  "generated_at": "2024-12-15T10:30:00Z",
  "communities": {
    "abc123": {
      "label": "Authentication System",
      "description": "Handles user login, token validation, and session management"
    },
    "def456": {
      "label": "Payment Processing",
      "description": "Processes payments, handles refunds, manages payment methods"
    }
  },
  "processes": {
    "proc_001": {
      "label": "User Login Flow",
      "description": "Validates credentials, creates session, returns auth token"
    },
    "proc_002": {
      "label": "Checkout Process",
      "description": "Validates cart, processes payment, creates order"
    }
  }
}
```

## Usage

After running this command, labels are used by:

| Consumer | How Labels Are Used |
|----------|---------------------|
| **noodl CLI** | Shows labels in `noodl status` and `noodl list` |
| **MCP resources** | `@noodlbox:map://current` includes labels in output |
| **generate_map** | Uses labels for module names and process titles in ARCHITECTURE/ |
| **detect_impact** | Uses labels in impact analysis output |

## Re-running

If `.noodlbox/labels.json` already exists:
- Confirm before overwriting
- Option to merge (keep existing labels, add new ones for new communities/processes)

## Output

Confirm completion with:
- Number of communities labeled
- Number of processes labeled
- Path to labels file
