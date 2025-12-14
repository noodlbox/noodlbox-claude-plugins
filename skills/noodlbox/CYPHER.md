# Cypher Query Examples

Reference for common Noodlbox knowledge graph queries using `noodlbox_raw_cypher_query`.

## Schema Overview

### Node Types
- `CODE_SYMBOL`: Functions, classes, methods, variables
- `FILE`: Source files
- `REPOSITORY`: Analyzed repositories

### Relationship Types
- `CALLS`: Symbol calls another symbol
- `CONTAINS`: File contains symbol
- `BELONGS_TO`: Symbol belongs to repository

### Key Properties
- `name`: Symbol/file name
- `kind`: Symbol type (function, class, method, etc.)
- `file_path`: Full path to file
- `community_id`: Leiden community cluster ID
- `start_line`, `end_line`: Line numbers

---

## Finding Symbols

### Find by name (exact)
```cypher
MATCH (s:CODE_SYMBOL {name: "handleRequest"})
RETURN s.name, s.kind, s.file_path, s.start_line
```

### Find by name (contains)
```cypher
MATCH (s:CODE_SYMBOL)
WHERE s.name CONTAINS "auth"
RETURN s.name, s.kind, s.file_path
LIMIT 20
```

### Find by kind
```cypher
MATCH (s:CODE_SYMBOL)
WHERE s.kind = "class"
RETURN s.name, s.file_path
```

### Find in specific file
```cypher
MATCH (s:CODE_SYMBOL)
WHERE s.file_path CONTAINS "services/user"
RETURN s.name, s.kind, s.start_line
ORDER BY s.start_line
```

---

## Call Graph Queries

### What does X call? (outgoing)
```cypher
MATCH (source:CODE_SYMBOL {name: "processOrder"})-[:CALLS]->(target)
RETURN target.name, target.kind, target.file_path
```

### What calls X? (incoming)
```cypher
MATCH (caller)-[:CALLS]->(target:CODE_SYMBOL {name: "validateUser"})
RETURN caller.name, caller.kind, caller.file_path
```

### Call chain (up to N hops)
```cypher
MATCH path = (start:CODE_SYMBOL {name: "main"})-[:CALLS*1..4]->(end)
RETURN [n IN nodes(path) | n.name] AS call_chain,
       end.file_path AS ends_in_file
LIMIT 50
```

### Find all paths between two symbols
```cypher
MATCH path = (a:CODE_SYMBOL {name: "controller"})-[:CALLS*1..6]->(b:CODE_SYMBOL {name: "database"})
RETURN [n IN nodes(path) | n.name] AS call_chain
LIMIT 10
```

---

## Dependency Analysis

### Most called symbols (entry points)
```cypher
MATCH (caller)-[:CALLS]->(target:CODE_SYMBOL)
WITH target, count(caller) AS call_count
ORDER BY call_count DESC
LIMIT 15
RETURN target.name, target.file_path, call_count
```

### Symbols with most dependencies
```cypher
MATCH (source:CODE_SYMBOL)-[:CALLS]->(dep)
WITH source, count(dep) AS dependency_count
ORDER BY dependency_count DESC
LIMIT 15
RETURN source.name, source.file_path, dependency_count
```

### Orphan symbols (no callers)
```cypher
MATCH (s:CODE_SYMBOL)
WHERE NOT exists((s)<-[:CALLS]-())
  AND s.kind IN ["function", "method"]
RETURN s.name, s.file_path
LIMIT 30
```

### Unused exports
```cypher
MATCH (s:CODE_SYMBOL)
WHERE s.kind = "function"
  AND NOT exists((s)<-[:CALLS]-())
  AND s.name NOT STARTS WITH "_"
RETURN s.name, s.file_path
```

---

## Community Analysis

### Symbols in a community
```cypher
MATCH (s:CODE_SYMBOL)
WHERE s.community_id = 5
RETURN s.name, s.kind, s.file_path
ORDER BY s.name
```

### Cross-community calls
```cypher
MATCH (a:CODE_SYMBOL)-[:CALLS]->(b:CODE_SYMBOL)
WHERE a.community_id <> b.community_id
RETURN a.name, a.community_id,
       b.name, b.community_id,
       a.file_path, b.file_path
LIMIT 50
```

### Community bridges (symbols connecting communities)
```cypher
MATCH (bridge:CODE_SYMBOL)-[:CALLS]->(other:CODE_SYMBOL)
WHERE bridge.community_id <> other.community_id
WITH bridge, count(DISTINCT other.community_id) AS communities_connected
ORDER BY communities_connected DESC
LIMIT 10
RETURN bridge.name, bridge.file_path, communities_connected
```

### Community size distribution
```cypher
MATCH (s:CODE_SYMBOL)
WITH s.community_id AS community, count(*) AS size
ORDER BY size DESC
RETURN community, size
LIMIT 20
```

---

## File Analysis

### Files with most symbols
```cypher
MATCH (s:CODE_SYMBOL)
WITH s.file_path AS file, count(*) AS symbol_count
ORDER BY symbol_count DESC
LIMIT 15
RETURN file, symbol_count
```

### Symbols in a directory
```cypher
MATCH (s:CODE_SYMBOL)
WHERE s.file_path STARTS WITH "src/services/"
RETURN s.name, s.kind, s.file_path
ORDER BY s.file_path, s.start_line
```

### Cross-file dependencies
```cypher
MATCH (a:CODE_SYMBOL)-[:CALLS]->(b:CODE_SYMBOL)
WHERE a.file_path <> b.file_path
WITH a.file_path AS source_file,
     b.file_path AS target_file,
     count(*) AS call_count
ORDER BY call_count DESC
LIMIT 20
RETURN source_file, target_file, call_count
```

---

## Pattern Matching

### Find similar function names
```cypher
MATCH (s:CODE_SYMBOL)
WHERE s.kind = "function"
  AND s.name =~ "handle.*Request"
RETURN s.name, s.file_path
```

### Find test files
```cypher
MATCH (s:CODE_SYMBOL)
WHERE s.file_path CONTAINS "test"
   OR s.file_path CONTAINS "spec"
RETURN DISTINCT s.file_path
```

### Find classes with many methods
```cypher
MATCH (class:CODE_SYMBOL {kind: "class"})<-[:BELONGS_TO]-(method:CODE_SYMBOL {kind: "method"})
WITH class, count(method) AS method_count
ORDER BY method_count DESC
LIMIT 10
RETURN class.name, class.file_path, method_count
```

---

## Aggregations

### Count by kind
```cypher
MATCH (s:CODE_SYMBOL)
RETURN s.kind, count(*) AS count
ORDER BY count DESC
```

### Count by file extension
```cypher
MATCH (s:CODE_SYMBOL)
WITH CASE
  WHEN s.file_path ENDS WITH ".ts" THEN "TypeScript"
  WHEN s.file_path ENDS WITH ".js" THEN "JavaScript"
  WHEN s.file_path ENDS WITH ".py" THEN "Python"
  ELSE "Other"
END AS language, s
RETURN language, count(*) AS symbol_count
```

### Average symbols per file
```cypher
MATCH (s:CODE_SYMBOL)
WITH s.file_path AS file, count(*) AS symbols
RETURN avg(symbols) AS avg_symbols_per_file,
       max(symbols) AS max_symbols,
       min(symbols) AS min_symbols
```
