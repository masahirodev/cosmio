# QueryBuilder SQL Generation Coverage

Coverage matrix for unit tests verifying that cosmio's QueryBuilder generates correct SQL.

Test files:
- `tests/client/query-builder.test.ts`
- `tests/client/select-metrics-count.test.ts`
- `tests/client/query-builder-dto.test.ts`

## SELECT

| Generated SQL | Covered | Test Name | File |
|--------------|---------|-----------|------|
| `SELECT * FROM c` | ✅ | generates basic SELECT query | query-builder |
| `SELECT TOP N * FROM c` | ✅ | generates TOP with limit | query-builder |
| `SELECT TOP 0 * FROM c` | ✅ | limit(0) generates TOP 0 | query-builder |
| `SELECT c.id, c.name FROM c` | ✅ | generates SELECT with specific fields | select-metrics-count |
| `SELECT TOP N c.id, c.name FROM c` | ✅ | works with select + orderBy + limit | select-metrics-count |
| `SELECT c.id, c.email FROM c WHERE ...` | ✅ | works with where + select | select-metrics-count |

## WHERE — Classic Style

| Operator | Generated SQL | Covered | Test Name | File |
|----------|--------------|---------|-----------|------|
| `=` | `c.field = @p0` | ✅ | generates WHERE clause | query-builder |
| `!=` | `c.field != @p0` | ✅ | generates != operator | query-builder |
| `>` | `c.field > @p0` | ✅ | generates multiple WHERE conditions | query-builder |
| `>=` | `c.field >= @p0` | ✅ | combines all clauses together | query-builder |
| `<` | `c.field < @p0` | ✅ | generates < operator | query-builder |
| `<=` | `c.field <= @p0` | ✅ | generates <= operator | query-builder |
| `CONTAINS` | `CONTAINS(c.field, @p0)` | ✅ | generates CONTAINS function call | query-builder |
| `STARTSWITH` | `STARTSWITH(c.field, @p0)` | ✅ | generates STARTSWITH function call (classic) | query-builder |
| `ENDSWITH` | `ENDSWITH(c.field, @p0)` | ✅ | generates ENDSWITH function call (classic) | query-builder |
| `ARRAY_CONTAINS` | `ARRAY_CONTAINS(c.field, @p0)` | ✅ | generates ARRAY_CONTAINS function call (classic) | query-builder |
| Multiple AND | `... AND ...` | ✅ | generates multiple WHERE conditions | query-builder |

## WHERE — Prisma Style

| Filter | Generated SQL | Covered | Test Name | File |
|--------|--------------|---------|-----------|------|
| `{ field: value }` | `c.field = @p0` | ✅ | where shorthand for equals | query-builder |
| `{ field: { equals: v } }` | `c.field = @p0` | ✅ | where equals | query-builder |
| `{ field: { not: v } }` | `c.field != @p0` | ✅ | where not | query-builder |
| `{ field: { gt: v } }` | `c.field > @p0` | ✅ | where gt, lte | query-builder |
| `{ field: { gte: v } }` | `c.field >= @p0` | ✅ | where gte | query-builder |
| `{ field: { lt: v } }` | `c.field < @p0` | ✅ | where lt | query-builder |
| `{ field: { lte: v } }` | `c.field <= @p0` | ✅ | where gt, lte | query-builder |
| `{ field: { contains: v } }` | `CONTAINS(c.field, @p0)` | ✅ | where contains | query-builder |
| `{ field: { startsWith: v } }` | `STARTSWITH(c.field, @p0)` | ✅ | where startsWith | query-builder |
| `{ field: { endsWith: v } }` | `ENDSWITH(c.field, @p0)` | ✅ | where endsWith | query-builder |
| `{ field: { in: [...] } }` | `ARRAY_CONTAINS(@p0, c.field)` | ✅ | where in | query-builder |
| Multiple fields | `... AND ...` | ✅ | combines multiple fields | query-builder |

## Auto-injected WHERE

| Condition | Generated SQL | Covered | Test Name | File |
|-----------|--------------|---------|-----------|------|
| Discriminator | `c.type = @p0` | ✅ | includes discriminator filter | query-builder |
| Discriminator + user WHERE | `c.type = @p0 AND c.name = @p1` | ✅ | combines discriminator with user WHERE | query-builder |
| Soft delete autoExclude | `NOT IS_DEFINED(c.deletedAt)` | ✅ | generates NOT IS_DEFINED for soft delete | query-builder |

## ORDER BY

| Generated SQL | Covered | Test Name | File |
|--------------|---------|-----------|------|
| `ORDER BY c.field DESC` | ✅ | generates ORDER BY clause | query-builder |
| `ORDER BY c.field ASC` (default) | ✅ | generates ORDER BY ASC (default) | query-builder |
| Multiple ORDER BY fields | ✅ | generates multiple ORDER BY fields | query-builder |

## OFFSET / LIMIT

| Generated SQL | Covered | Test Name | File |
|--------------|---------|-----------|------|
| `OFFSET N LIMIT M` | ✅ | generates OFFSET/LIMIT | query-builder |
| `OFFSET N LIMIT 1000` (default) | ✅ | offset without limit applies default | query-builder |

## COUNT

| Generated SQL | Covered | Test Name | File |
|--------------|---------|-----------|------|
| `SELECT VALUE COUNT(1) FROM c` | ✅ | generates COUNT query | select-metrics-count |
| COUNT with WHERE | ✅ | count with WHERE preserves conditions | query-builder |
| COUNT strips ORDER BY | ✅ | count strips ORDER BY from query | query-builder |
| COUNT strips OFFSET LIMIT | ✅ | count strips OFFSET LIMIT from query | query-builder |

## whereRaw

| Case | Covered | Test Name | File |
|------|---------|-----------|------|
| Expression only (no params) | ✅ | whereRaw with no params | query-builder |
| Expression + params | ✅ | whereRaw with params | query-builder |
| whereRaw + Prisma where combined | ✅ | whereRaw combined with Prisma-style | query-builder |

## DTO / asDto

| Case | Covered | Test Name | File |
|------|---------|-----------|------|
| asDto does not change SQL | ✅ | generates correct SQL unchanged by asDto | query-builder-dto |
| asDto + where + orderBy + limit | ✅ | can chain after asDto | query-builder-dto |

## Field Name Validation

| Case | Covered | Test Name | File |
|------|---------|-----------|------|
| Spaces → rejected | ✅ | rejects spaces | query-builder |
| Quotes → rejected | ✅ | rejects quotes | query-builder |
| Leading digit → rejected | ✅ | rejects digit start | query-builder |
| Dot notation → allowed | ✅ | allows dot-notation | query-builder |

## Partition Key Scoping

Passed via SDK `options.partitionKey`, not embedded in SQL.
Verified in integration tests (`tests/integration/`), not in SQL generation unit tests.

---

## Coverage: 100%

All identified SQL generation patterns are covered by unit tests.
