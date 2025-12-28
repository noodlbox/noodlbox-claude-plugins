# Cypher Patterns Reference

Complete reference for querying the code knowledge graph.

## Finding Callers

### Direct Callers

```cypher
MATCH (caller)-[:CALLS]->(target:CODE_SYMBOL {name: "validateUser"})
RETURN caller.name, caller.file_path
```

### Callers with Context

```cypher
MATCH (caller)-[:CALLS]->(target:CODE_SYMBOL {name: "validateUser"})
RETURN caller.name, caller.kind, caller.file_path, caller.community_id
ORDER BY caller.name
```

### Callers from Different Communities

```cypher
MATCH (caller)-[:CALLS]->(target:CODE_SYMBOL {name: "validateUser"})
WHERE caller.community_id <> target.community_id
RETURN caller.name, caller.community_id, caller.file_path
```

## Finding Callees

### Direct Callees

```cypher
MATCH (source:CODE_SYMBOL {name: "processOrder"})-[:CALLS]->(target)
RETURN target.name, target.file_path
```

### Callees by Type

```cypher
MATCH (source:CODE_SYMBOL {name: "processOrder"})-[:CALLS]->(target)
WHERE target.kind = "Function"
RETURN target.name, target.file_path
```

## Call Chain Traversal

### Fixed Depth (exactly 3 hops)

```cypher
MATCH path = (start:CODE_SYMBOL {name: "main"})-[:CALLS*3]->(end)
RETURN [n IN nodes(path) | n.name] AS chain
LIMIT 20
```

### Variable Depth (1-4 hops)

```cypher
MATCH path = (start:CODE_SYMBOL {name: "main"})-[:CALLS*1..4]->(end)
RETURN [n IN nodes(path) | n.name] AS chain
LIMIT 20
```

### Path to Specific Target

```cypher
MATCH path = (start:CODE_SYMBOL {name: "handleRequest"})-[:CALLS*1..5]->(end:CODE_SYMBOL {name: "saveToDatabase"})
RETURN [n IN nodes(path) | n.name] AS chain
LIMIT 10
```

## Entry Points

### Most Called Symbols

```cypher
MATCH (caller)-[:CALLS]->(target:CODE_SYMBOL)
WITH target, count(caller) AS calls
ORDER BY calls DESC
LIMIT 10
RETURN target.name, target.file_path, calls
```

### Symbols Called from Outside Their Community

```cypher
MATCH (caller)-[:CALLS]->(target:CODE_SYMBOL)
WHERE caller.community_id <> target.community_id
WITH target, count(DISTINCT caller.community_id) AS external_communities
ORDER BY external_communities DESC
LIMIT 10
RETURN target.name, external_communities
```

## Cross-Community Analysis

### All Cross-Community Calls

```cypher
MATCH (a:CODE_SYMBOL)-[:CALLS]->(b:CODE_SYMBOL)
WHERE a.community_id <> b.community_id
RETURN a.name, a.community_id, b.name, b.community_id
LIMIT 30
```

### Calls Between Specific Communities

```cypher
MATCH (a:CODE_SYMBOL)-[:CALLS]->(b:CODE_SYMBOL)
WHERE a.community_id = "auth" AND b.community_id = "database"
RETURN a.name, b.name, a.file_path
```

### Community Coupling (aggregate)

```cypher
MATCH (a:CODE_SYMBOL)-[:CALLS]->(b:CODE_SYMBOL)
WHERE a.community_id <> b.community_id
WITH a.community_id AS from_community, b.community_id AS to_community, count(*) AS calls
ORDER BY calls DESC
RETURN from_community, to_community, calls
LIMIT 20
```

## Symbol Analysis

### Find by Name Pattern

```cypher
MATCH (s:CODE_SYMBOL)
WHERE s.name CONTAINS "validate"
RETURN s.name, s.kind, s.file_path
LIMIT 20
```

### Find by File Path

```cypher
MATCH (s:CODE_SYMBOL)
WHERE s.file_path CONTAINS "payments"
RETURN s.name, s.kind, s.file_path
```

### Symbol with No Callers (potential dead code)

```cypher
MATCH (s:CODE_SYMBOL)
WHERE NOT exists((s)<-[:CALLS]-())
AND s.kind = "Function"
RETURN s.name, s.file_path
LIMIT 20
```

## Import Analysis

### What Does a File Import?

```cypher
MATCH (source:CODE_SYMBOL)-[:IMPORTS]->(target)
WHERE source.file_path CONTAINS "checkout/handler"
RETURN DISTINCT target.name, target.file_path
```

### What Imports This Module?

```cypher
MATCH (source)-[:IMPORTS]->(target:CODE_SYMBOL)
WHERE target.file_path CONTAINS "utils/validation"
RETURN DISTINCT source.file_path
```

## Performance Tips

- Always use `LIMIT` to prevent large result sets
- Use specific `name` filters when possible
- Limit hop depth to 4 or less for `*1..N` patterns
- Use `DISTINCT` for aggregations
