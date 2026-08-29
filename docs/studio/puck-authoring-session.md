# Studio Puck authoring session

The authoring session is the bridge between Puck's transient drag/drop state and Vira's canonical `StudioExperienceDocument`.

It deliberately does not make Puck Data persistent truth.

```text
current StudioDocument
        |
        v
    Puck Data
        |
 user drag/drop/edit
        |
        v
 Puck onChange Data
        |
        +-- validate component identities / bounds
        +-- allocate canonical ids for new Puck nodes
        +-- import selected view
        +-- revalidate complete StudioDocument + catalog
        |
        v
new canonical StudioDocument
```

## Host-owned node id allocation

Puck generates ids for inserted components. Those ids may not satisfy Studio's semantic node-id grammar. The session therefore requires an explicit host `allocateNodeId(request)` function.

The allocator receives a frozen request containing only:

- active Studio `viewId`;
- exact semantic component reference;
- Puck-generated id.

The returned value must be one canonical Studio node id and must not collide with any id already reserved in the active view. Allocator exceptions are contained and their raw messages are not reflected.

Mappings are cached by Puck id for the lifetime of the authoring session, so repeated `onChange` events do not allocate a new canonical identity for the same inserted node.

## Transactional reconciliation

`reconcile(data)` does not mutate the current canonical document in place.

It first validates the bounded Puck identity surface, prepares only the currently required id mappings, then delegates to the Studio Puck adapter. The adapter replaces one view and revalidates the complete StudioDocument and active brand catalog.

The session updates `currentDocument()` only after that import succeeds. A visual edit that removes a node still referenced by a canonical binding or interaction therefore fails and leaves the previous document active.

This is intentionally strict. Dedicated binding/action authoring phases will remove or rewrite those references explicitly rather than letting visual drag/drop silently delete business behavior.
