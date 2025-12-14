# Noodlbox Workflows

## Important: Always Get Context First

Before any workflow, read the repository list to understand what's available:
```
@noodlbox:repository://list
```

Use `"current"` or `current` as the repository parameter—the MCP server auto-detects from the working directory.

---

## Code Exploration Workflow

**Goal**: Understand unfamiliar code systematically

1. **Check available repositories**
   ```
   @noodlbox:repository://list
   ```
   Verify the current directory is analyzed.

2. **Get the big picture**
   ```
   @noodlbox:map://current
   ```
   Identify major communities/modules and their relationships.

3. **Drill into a community**
   ```
   @noodlbox:map://current/community/{id}
   ```
   See entry points, key symbols, and internal processes.

4. **Search for specific functionality**
   ```
   noodlbox_query_with_context(repository: "current", q: "payment processing", task_context: "exploring payment flow")
   ```

5. **Trace a process**
   ```
   @noodlbox:map://current/process/{id}
   ```
   Follow the execution flow with file locations.

---

## Debugging Workflow

**Goal**: Find the root cause of a bug

1. **Locate the symptom**
   ```
   noodlbox_query_with_context(repository: "current", q: "error message or symptom", task_context: "debugging")
   ```

2. **Find upstream callers**
   ```cypher
   MATCH (caller)-[:CALLS*1..5]->(target:CODE_SYMBOL)
   WHERE target.name = "buggyFunction"
   RETURN caller.name, caller.file_path
   ORDER BY length((caller)-[:CALLS*]->(target))
   ```

3. **Check dependencies**
   ```cypher
   MATCH (source:CODE_SYMBOL)-[:CALLS]->(dep)
   WHERE source.name = "buggyFunction"
   RETURN dep.name, dep.file_path
   ```

4. **Look for related symbols in the same community**
   ```cypher
   MATCH (a:CODE_SYMBOL), (b:CODE_SYMBOL)
   WHERE a.name = "buggyFunction"
     AND a.community_id = b.community_id
   RETURN b.name, b.kind, b.file_path
   ```

---

## Refactoring Workflow

**Goal**: Safely refactor code without breaking things

1. **Assess impact of uncommitted changes**
   ```
   noodlbox_detect_impact(repository: "current", change_scope: "all")
   ```

2. **Find all callers of the symbol to change**
   ```cypher
   MATCH (caller)-[:CALLS]->(target:CODE_SYMBOL {name: "oldFunction"})
   RETURN DISTINCT caller.name, caller.file_path
   ```

3. **Check for cross-module dependencies**
   ```cypher
   MATCH (a:CODE_SYMBOL)-[:CALLS]-(b:CODE_SYMBOL)
   WHERE a.name = "oldFunction"
     AND a.community_id <> b.community_id
   RETURN a.community_id, b.name, b.community_id, b.file_path
   ```

4. **Find similar patterns to update**
   ```cypher
   MATCH (s:CODE_SYMBOL)
   WHERE s.name CONTAINS "similar"
   RETURN s.name, s.file_path
   ```

---

## Impact Analysis Workflow

**Goal**: Understand the blast radius of a change

1. **Start with change detection**
   ```
   noodlbox_detect_impact(repository: "current", change_scope: "all")
   ```

2. **For specific files, find direct callers**
   ```cypher
   MATCH (caller)-[:CALLS]->(changed:CODE_SYMBOL)
   WHERE changed.file_path CONTAINS "path/to/changed/file"
   RETURN DISTINCT caller.name, caller.file_path
   ```

3. **Find transitive dependencies (up to 3 hops)**
   ```cypher
   MATCH path = (caller)-[:CALLS*1..3]->(changed:CODE_SYMBOL)
   WHERE changed.file_path CONTAINS "path/to/changed/file"
   RETURN DISTINCT [n IN nodes(path) | n.name] AS call_chain,
          caller.file_path AS caller_file
   ```

4. **Identify affected tests**
   ```cypher
   MATCH (test:CODE_SYMBOL)-[:CALLS*1..5]->(changed:CODE_SYMBOL)
   WHERE changed.file_path CONTAINS "path/to/changed/file"
     AND (test.name CONTAINS "test" OR test.file_path CONTAINS "test")
   RETURN test.name, test.file_path
   ```

---

## Architecture Review Workflow

**Goal**: Understand overall system structure

1. **Get repository overview**
   ```
   @noodlbox:map://current
   ```

2. **Find entry points (highly called symbols)**
   ```cypher
   MATCH (caller)-[:CALLS]->(entry:CODE_SYMBOL)
   WITH entry, count(caller) AS incoming_calls
   ORDER BY incoming_calls DESC
   LIMIT 20
   RETURN entry.name, entry.file_path, incoming_calls
   ```

3. **Find core dependencies (symbols that call many others)**
   ```cypher
   MATCH (core:CODE_SYMBOL)-[:CALLS]->(dep)
   WITH core, count(dep) AS outgoing_calls
   ORDER BY outgoing_calls DESC
   LIMIT 20
   RETURN core.name, core.file_path, outgoing_calls
   ```

4. **Identify cross-module bridges**
   ```cypher
   MATCH (a:CODE_SYMBOL)-[:CALLS]->(b:CODE_SYMBOL)
   WHERE a.community_id <> b.community_id
   WITH a.community_id AS from_community,
        b.community_id AS to_community,
        count(*) AS connections
   ORDER BY connections DESC
   LIMIT 10
   RETURN from_community, to_community, connections
   ```
