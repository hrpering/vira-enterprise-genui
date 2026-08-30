# Studio lifecycle service

`@vira-enterprise-genui/studio-lifecycle` is the product lifecycle boundary between Experience Studio authoring and whichever persistence system the host chooses.

```text
Experience Studio
      ↓
StudioLifecycleService
      ↓
canonical Studio validation / publish compiler
      ↓
StudioLifecycleStore
      ↓
Postgres / object store / local file adapter / other host storage
```

## Product invariants

### Workspace scope is explicit

Every operation includes a `workspaceId`. Authentication and authorization remain host responsibilities; the lifecycle service never infers a workspace from browser state or a global singleton.

A storage implementation must include the workspace key in every record lookup and write predicate.

### Draft and publication are separate

A draft has its own `draftRevision`. Publishing creates a canonical `StudioPublication` from that exact draft revision and records `publishedDraftRevision`.

Saving a later draft does **not** mutate the active publication. The published artifact changes only after another explicit `publish()` call.

This prevents an ordinary authoring save from silently changing production UI.

### All mutations are concurrency controlled

`recordVersion` changes for every persisted mutation. Save, publish, unpublish and delete require `expectedRecordVersion`.

The `StudioLifecycleStore` contract requires compare-and-swap behavior to be atomic. A production SQL adapter should place the version predicate in the update/delete statement itself, for example conceptually:

```text
UPDATE studio_experience
SET ... record_version = record_version + 1
WHERE workspace_id = ?
  AND experience_id = ?
  AND record_version = ?
```

A zero-row update is a version conflict, not a successful save.

### Drafts use canonical Studio validation

Create/save operations validate the document through the active component catalog, binding source catalog, design rules and action-flow contract before persistence.

Publish additionally runs `prepareStudioPublication`, so the persisted live artifact is the canonical compiler output rather than arbitrary JSON supplied by the UI.

### Storage is a port, not an implementation assumption

The core package does not depend on PostgreSQL, Redis, S3, a filesystem or a cloud provider. Adapters implement `StudioLifecycleStore`.

The existing `examples/experience-studio-demo/.data` filesystem remains a local demonstration adapter until it is migrated onto this port; it is not described as enterprise persistence.

## Record versions

A record tracks two distinct counters:

- `draftRevision`: increments only when the draft document/name is saved.
- `recordVersion`: increments for every persisted mutation and is used for optimistic concurrency.

Example:

```text
create draft A
  draftRevision = 1
  recordVersion = 1

publish A
  draftRevision = 1
  recordVersion = 2
  publishedDraftRevision = 1

save draft B
  draftRevision = 2
  recordVersion = 3
  publication still A
  publishedDraftRevision = 1

republish
  draftRevision = 2
  recordVersion = 4
  publication becomes B
  publishedDraftRevision = 2
```

## Explicitly outside this package

- authentication/session management
- user/role authorization
- billing and quotas
- database migrations
- HTTP routing
- CDN/cache invalidation
- distributed locking
- external airline/payment side effects
- Chat UI or Chat transport

Those concerns integrate around the lifecycle service; none are faked inside it.
