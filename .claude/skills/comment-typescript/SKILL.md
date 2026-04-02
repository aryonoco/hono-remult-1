---
name: comment-typescript
description: "Review and rewrite comments in TypeScript files to explain 'why' not 'what', following Remult entity and Angular component conventions."
user-invocable: true
disable-model-invocation: true
argument-hint: <directory-or-file-path>
---

# Comment Review: TypeScript

Review and improve all comments in TypeScript files at: `$ARGUMENTS`

## Instructions

Read the universal commenting principles first:

- [Universal rules](../comment-base/SKILL.md)
- [AI anti-patterns to eliminate](../comment-base/anti-patterns.md)

Then read the TypeScript-specific conventions:

- [TypeScript conventions](conventions.md)

## File Discovery

Glob for `**/*.ts` and `**/*.tsx` in the target path. Exclude:

- `**/node_modules/**`
- `**/dist/**`
- `**/*.d.ts` (type declaration files)
- `**/*.test.ts` and `**/*.spec.ts` (test files — comment separately if needed)
- `**/coverage/**`

## Workflow

For each discovered file:

1. Read the entire file
2. Identify every comment (JSDoc blocks, inline `//`, block `/* */`)
3. Apply the universal rules and TypeScript conventions
4. Edit only comments — zero changes to code, imports, formatting, or whitespace
5. After editing, re-read the file and verify no functional changes occurred

## Key Reminders

- Entity decorators (`@Entity`, `@Fields.*`, `@Relations.*`, `@BackendMethod`) are
  self-documenting — do not add comments restating what the decorator does
- BackendMethods: JSDoc only when the business logic is non-obvious
- Permission decisions (`allowApiUpdate`, `apiPrefilter`) deserve WHY comments
- `saving`/`validation` hooks: comment the business rule, not the hook mechanism
- Angular signal patterns (`signal`, `computed`, `effect`) are self-documenting
- Inline comments must be rare and intentional — only for non-obvious behaviour
- Use `@see` for cross-references between related entities
- All comments in British English spelling; never rename identifiers
