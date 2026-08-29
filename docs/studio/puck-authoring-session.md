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

The returned value must be one canonical Studio node id, must not collide with any id already reserved in the active view, and must not be one of Puck's editor-reserved canonical identities. Reserved identities such as Studio `root` may exist in a canonical document, but they must be present before the Puck session starts so the adapter can seed their editor aliases deterministically. A newly generated Puck node cannot be renamed into such an identity during reconciliation.

Mappings are cached by Puck id for the lifetime of the authoring session, so repeated `onChange` events do not allocate a new canonical identity for the same inserted node.

## Reserved Puck identities

Puck owns editor-internal identities that are not part of the Studio document contract. In particular, Puck reserves `root` for its synthetic editor root while `root` remains a valid canonical Studio node id.

The authoring session therefore seeds the adapter's reserved-id mappings for the active view before any edit occurs. A canonical Studio `root` is represented as the non-semantic Puck alias `vira~root`, and the reverse mapping is retained for selection, reconciliation, and renderer context.

The mapping is bidirectional for the active view only:

```text
Studio node id       Puck editor id
root             <-> vira~root
```

Reserved aliases never become canonical Studio ids. Renderer aliases are decoded only when the alias is present in the Puck tree exported from the active canonical view; a reserved-looking arbitrary Puck id is not trusted by string pattern alone.

When the active view changes, the workbench creates a new Puck authoring session and a fresh view-scoped identity mapping.

## Transactional reconciliation

`reconcile(data)` does not mutate the current canonical document in place.

It first validates the bounded Puck identity surface, prepares only the currently required id mappings, then delegates to the Studio Puck adapter. The adapter replaces one view and revalidates the complete StudioDocument and active brand catalog.

Puck editor data is treated as an untrusted reflection boundary even though it originates from the embedded editor. Accessor-backed data fields are inspected through property descriptors instead of being invoked, and unexpected reflection failures such as revoked Proxies are contained as structured `INVALID_PUCK_DATA` results rather than escaping as JavaScript exceptions. The public adapter import boundary applies the same fail-closed rule before canonical Studio state can be replaced.

The session updates `currentDocument()` only after that import succeeds. A visual edit that removes a node still referenced by a canonical binding or interaction therefore fails and leaves the previous document active.

This is intentionally strict. Dedicated binding/action authoring phases will remove or rewrite those references explicitly rather than letting visual drag/drop silently delete business behavior.
