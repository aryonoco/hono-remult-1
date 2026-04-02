---
globs: "libs/shared/domain/**/*.ts"
---

# Entity Conventions

## File Organisation
- One entity per file, kebab-case filename matching the entity name (`task.ts`, `project-member.ts`)
- Group by domain aggregate in subdirectories (`tasks/`, `projects/`, `auth/`)
- Every entity re-exported from `libs/shared/domain/src/index.ts`
- Operations files (`*.operations.ts`) only for cross-entity logic that doesn't belong on any single entity

## Entity Decorator
- Always provide explicit permissions — never bare `allowApiCrud: true` in production
- Use granular `allowApiRead`, `allowApiInsert`, `allowApiUpdate`, `allowApiDelete` when roles differ
- Row-level: `allowApiUpdate: (item) => item.ownerId === remult.user?.id`
- Query-level: `apiPrefilter` for hiding rows from API consumers; `backendPrefilter` when the filter must apply everywhere including BackendMethods
- `defaultOrderBy` for consistent query results

## Fields
- Use `Fields.*` helpers (`Fields.string()`, `Fields.boolean()`, etc.) — never bare `@Field()`
- `Fields.id()` for primary keys (UUID by default); use `idFactory` for custom IDs
- `Fields.createdAt()` / `Fields.updatedAt()` for timestamps — these are read-only via API automatically
- `allowApiUpdate: false` on server-managed fields (`createdBy`, `status` set by lifecycle hooks)
- `includeInApi: false` on sensitive fields (password hashes, internal tokens)
- `validate:` for field-level validation — runs on both client and server

## Relations
- Always define the FK field explicitly alongside the relation:
  ```typescript
  @Fields.string()
  customerId = '';
  @Relations.toOne(() => Customer, 'customerId')
  customer?: Customer;
  ```
- Many-to-many: use an intermediate entity with composite PK (`id: { field1: true, field2: true }`)
- Use `include:` in find options for eager loading; `defaultIncluded: true` only when the relation is always needed

## Business Logic
- BackendMethods belong on the entity they operate on — never in separate controller files
- Instance methods for row operations (approve, archive, toggle)
- Static methods for collection operations (bulk update, reports)
- Cross-entity operations go in an `*.operations.ts` file in the relevant domain folder
- BackendMethods bypass entity API restrictions — always check authorisation manually inside them

## Lifecycle Hooks
- `validation` — cross-field business rules (runs both client and server)
- `saving` — computed fields, audit trails, defaults for new records (`e.isNew`)
- `saved` / `deleted` — side effects (notifications, logging)
- Never throw raw errors in hooks — return validation error messages

## Error Handling
- Complex BackendMethod logic: wrap in `neverthrow` `ResultAsync` for explicit error handling
- Simple validation: use Remult's built-in validator mechanism

## Module Boundary
- Code in `libs/shared/domain/` must not import from `@angular/*`, `hono`, or `hono/*`
- Only `remult` and `neverthrow` are allowed external dependencies
