# Remult Value Lists & Metadata-Driven UI

The "define once, enforce everywhere" payoff: model enums as classes that carry their own display data,
then render labels, dropdown options, and permission-gated controls **from the entity metadata** — never
from hardcoded literals duplicated in components.

---

## ValueListFieldType — enums that carry data

**Pattern:** a class decorated with `@ValueListFieldType`. Each static member is a value; `id` is what is
stored/sent, `caption` is what you display, and you can attach any extra properties (colour, order, …).

```typescript
import { Field, Fields, ValueListFieldType, getValueList, ValueListInfo } from 'remult';

@ValueListFieldType()
export class TaskStatus {
  static open = new TaskStatus('open', 'Open', '#22c55e');
  static inProgress = new TaskStatus('in-progress', 'In progress', '#eab308');
  static done = new TaskStatus('done', 'Done', '#94a3b8');
  constructor(
    public id: string,
    public caption: string,
    public color: string,
  ) {}
}

export class Task {
  @Fields.id()
  id = '';

  // Declare a value-list field with the base @Field decorator, passing the class
  // as the type factory — NOT @Fields.object() (that is for plain JSON objects).
  @Field(() => TaskStatus)
  status = TaskStatus.open;
}
```

**Why prefer it** over `Fields.enum`/`Fields.literal`/plain strings: the display metadata lives on the
value itself, so dropdowns and labels stay in sync automatically, and the list scales without a parallel
labels map. `id` (stored) and `caption` (shown) are decoupled, and auto-titleising fills a missing
`caption` from the `id` (`in-progress` → `In Progress`).

---

## getValueList — populate dropdowns

```typescript
for (const s of getValueList(TaskStatus)) {
  // s.id, s.caption, s.color
}
```

`getValueList` accepts the enum class, a field's `fieldRef`, or `FieldMetadata` — so a generic form can
list a field's options without knowing the concrete type.

---

## ValueListInfo — cross a string boundary (`<select>`, URLs, FormData)

A ValueList field is a class **instance**; HTML inputs and query strings are **strings**.
`ValueListInfo.get(EnumClass)` bridges them:

```typescript
const info = ValueListInfo.get(TaskStatus);
info.toInput(TaskStatus.open);   // 'open'      (instance → string id)
info.fromInput('open');          // TaskStatus.open (string id → instance)
```

```typescript
// URL <-> instance
const params = new URLSearchParams(location.search);
const status = info.fromInput(params.get('status') ?? '');
params.set('status', info.toInput(TaskStatus.open));
```

In Angular/Vue/Svelte template two-way binds on objects you bind the **instance** directly; reach for
`toInput`/`fromInput` only when something forces strings (a native `<select value>`, a URL, localStorage).

**Avoid:** hardcoding `['open','in-progress','done']` in a component. That is a second source of truth that
drifts from the entity. Render from `getValueList` instead.

---

## Field metadata — labels, types, options from the entity

Read field definitions off the repository so one source of truth drives the UI.

```typescript
const f = repo(Task).metadata.fields.status;
f.key;        // 'status'   — the field name
f.caption;    // 'Status'   — label (auto-generated from key if not set)
f.valueType;  // the value-list class / String / Number …
f.inputType;  // HTML input-type hint
f.options;    // raw FieldOptions (validate, includeInApi, …)
```

```html
<label [for]="f.key">{{ f.caption }}</label>
```

Set an explicit label with `@Fields.string({ label: 'Task title' })`; otherwise `firstName` → `First Name`
is generated for you.

---

## Permission-gated UI — never duplicate the rule

Ask the metadata whether the current user may act; it re-evaluates against `remult.user` and mirrors the
server check exactly.

```typescript
// Entity-level — apiReadAllowed is a property; apiInsertAllowed is a method (pass a candidate row)
repo(Task).metadata.apiReadAllowed;                        // boolean property
repo(Task).metadata.apiInsertAllowed(repo(Task).create()); // method

// Row-level — entity-ref getters (row already bound)
repo(Task).getEntityRef(task).apiUpdateAllowed;  // can the user update THIS row?
repo(Task).getEntityRef(task).apiDeleteAllowed;  // can the user delete THIS row?

// Field-level — methods that take the row
repo(Task).fields.title.includedInApi(task);     // is this field visible?
repo(Task).fields.title.apiUpdateAllowed(task);  // editable?
```

```html
@if (repo.getEntityRef(task).apiUpdateAllowed) {
  <button (click)="save(task)">Save</button>
}
```

**Avoid:** re-implementing `if (user.role === 'admin')` in the component. The metadata check is the same
predicate the server enforces, so the button and the API never disagree.

---

## Angular (zoneless, signals) — the four things together

```typescript
import { Component, signal, inject, DestroyRef } from '@angular/core';
import { repo } from 'remult';
import { getValueList, ValueListInfo } from 'remult';

@Component({ /* standalone */ })
export class TaskRowComponent {
  private destroyRef = inject(DestroyRef);

  readonly statusOptions = getValueList(TaskStatus);                 // 1. options from the entity
  readonly statusLabel = repo(Task).metadata.fields.status.caption;  // 2. label from metadata
  readonly tasks = signal<Task[]>([]);

  canSave = (t: Task) => repo(Task).getEntityRef(t).apiUpdateAllowed; // 3. permission from metadata

  constructor() {
    const unsub = repo(Task)                                          // 4. realtime
      .liveQuery({ orderBy: { createdAt: 'desc' } })
      .subscribe((info) => this.tasks.set(info.items));
    this.destroyRef.onDestroy(unsub);
  }
}
```

```html
<select [value]="info.toInput(task.status)"
        (change)="task.status = info.fromInput($any($event.target).value)">
  @for (s of statusOptions; track s.id) {
    <option [value]="info.toInput(s)">{{ s.caption }}</option>
  }
</select>
```

(`info = ValueListInfo.get(TaskStatus)`.) Every affordance traces back to the entity, so changing the
status list or a permission rule updates the UI with no component edits.

---

## ValueList vs literal unions

`@ValueListFieldType` is the framework-preferred form: it co-locates per-value metadata (caption, colour,
order, behaviour) with the value and feeds the metadata-driven UI above. The lighter alternative is a
plain `Fields.literal(() => VALUES)` string-literal union with labels kept in a separate display/i18n
layer — choose it when you want exact union types on the field and no per-value data on the domain object.
Either way, the metadata-driven *UI* principles above still apply: render options from the value set and
gate controls with `getEntityRef(row).apiUpdateAllowed`.
