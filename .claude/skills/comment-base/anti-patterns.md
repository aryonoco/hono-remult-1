# AI Comment Anti-Patterns

Detect and eliminate every instance of these patterns. Each pattern includes a
detection heuristic and the correct response.

## 1. Tautological Comments

**Detection**: Comment restates the code on the next line in natural language.

**Before** (delete):
```
// Increment the counter
counter++;

// Return the result
return result;

// Check if the user is authenticated
if (user.isAuthenticated) {
```

**Action**: Delete the comment entirely. The code is the documentation.

## 2. Signature Restatement in Docstrings

**Detection**: Docstring repeats the function name, parameter names, parameter types,
or return type that are already expressed in the function signature or type system.

**Before** (delete or rewrite):
```typescript
/**
 * Processes the user data.
 * @param user - The user object to process
 * @param options - The options for processing
 * @returns The processed user data
 */
function processUserData(user: User, options: ProcessOptions): ProcessedData {
```

**Action**: Delete the docstring if the function name is self-explanatory.
Rewrite only if there is a non-obvious "why" to document (e.g. fallback behaviour,
ordering guarantees, side effects).

## 3. Numbered Step Narration

**Detection**: Comments follow a `// Step N:` or `# Step N:` pattern.

**Before** (delete):
```python
# Step 1: Connect to the database
conn = get_connection()
# Step 2: Execute the query
cursor = conn.execute(query)
# Step 3: Fetch results
results = cursor.fetchall()
```

**Action**: Delete all step comments. If the sequence has a non-obvious ordering
constraint, replace with a single comment explaining WHY that order matters.

## 4. Section Header ASCII Art

**Detection**: Lines of `===`, `---`, `***`, `###`, or box-drawing characters used
as visual separators between code sections.

**Before** (delete):
```
// ============================================
// ===        USER AUTHENTICATION           ===
// ============================================
```

**Action**: Delete entirely. If a file needs section headers, the file is too long.
In the rare case a section marker is genuinely needed, a bare `// --- Authentication`
suffices, but prefer splitting the file.

## 5. Generic Boilerplate Headers

**Detection**: Comments like `// Import modules`, `// Define constants`, `// Main function`,
`// Helper functions`, `// Handle errors`, `// Export`, `// This file contains...`.

**Before** (delete):
```python
# Import necessary modules
import os
import sys

# Define constants
MAX_RETRIES = 3
```

**Action**: Delete. These are content-free section labels.

## 6. Over-Eager `@param` / `Args` Documentation

**Detection**: Every parameter is documented with a restatement of its name or type.

**Before** (delete the redundant params):
```typescript
/**
 * @param id - The ID of the user
 * @param name - The user's name
 */
function findUser(id: UserId, name: string): Effect.Effect<User, UserNotFound> {
```

**Action**: Delete `@param` entries that add nothing. Keep only params where
the docstring adds context the type cannot express (valid ranges, encoding,
ownership semantics).

## 7. Trailing Inline Restaters

**Detection**: End-of-line comments that restate the attribute or variable name.

**Before** (delete):
```hcl
location = var.location  # Set the Azure region
tags     = var.tags       # Apply tags to the resource
```

**Action**: Delete. The attribute name is the documentation.

## 8. Enthusiastic or Marketing Language

**Detection**: Words like "elegantly", "seamlessly", "beautifully", "leverage",
"powerful", "robust", "cutting-edge", "state-of-the-art".

**Action**: Replace with factual language or delete the sentence.

## 9. File-Level "This File Contains" Comments

**Detection**: `// This file contains...`, `# This module provides...`,
`/* This class is responsible for... */`.

**Action**: Rewrite to explain WHY the file/module exists and what architectural
role it plays, or delete if the filename and exports are self-explanatory.

## 10. Commented-Out Code Without Context

**Detection**: Blocks of commented-out code without an explanation of why they are
retained (e.g. no TODO, no issue reference).

**Action**: Do NOT delete commented-out code (that would be a functional change
in some contexts). Instead, add a brief comment explaining why it is retained,
or flag it for the developer's attention.
