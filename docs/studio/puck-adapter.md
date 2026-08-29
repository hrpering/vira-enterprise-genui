# Studio Puck adapter

Studio uses Puck as an embedded visual-editor engine, not as Vira's canonical experience format.

The adapter is pinned to `@puckeditor/core` **0.22.4**. Puck 0.22 uses inline `slot` fields for nested components; legacy DropZone/`zones` content is not accepted by the Studio adapter.

## Ownership boundary

```text
StudioComponentCatalog
        |
        +--> Puck field/slot metadata
        |
StudioDocument view
        |
        +--> Puck Data (editor session)
        |
        +<-- Puck Data
        |
StudioDocument
```

Puck Data is ephemeral editor state. `StudioExperienceDocument` remains the Vira-owned authoring artifact.

The adapter does not put executable render implementations into Studio contracts. The React Studio shell assembles Puck render functions from an explicit trusted in-memory renderer registry. Executable React components never enter `StudioComponentCatalog`, `StudioDocument`, or `StudioPublication`.

## Field mapping

The safe Studio catalog maps to Puck editor fields as follows:

| Studio catalog prop | Puck field |
| --- | --- |
| `string` | `text` |
| `number` | `number` |
| `boolean` | `radio` with explicit true/false values |
| `enum` | `select` |
| declared child slot | `slot` |

Puck-reserved `id`/`puck` field names and prop-to-slot name collisions fail closed in this adapter.

## Nested component mapping

Studio keeps a flat deterministic representation:

```text
parentId + slot + order
```

Puck 0.22 stores nested slot children inline in the parent component's props as `ComponentData[]`. Export recursively converts Studio sibling order into array order. Import flattens those arrays back into Studio nodes.

No legacy `zones` map is emitted. Non-empty incoming `zones` are rejected so the Vira adapter has one canonical Puck shape.

## Bindings and actions stay outside Puck Data

Studio bindings and interactions are not encoded into hidden Puck props. They remain on the surrounding `StudioDocument`.

When exporting a view, props that have canonical Studio bindings are represented in Puck `readOnly` metadata. Import replaces only the selected view and then revalidates the complete document. If a visual edit deletes a node that is still referenced by a binding or interaction, import fails instead of silently deleting business behavior.

## Node ids and Puck-reserved identities

Canonical Studio node ids stay independent from Puck implementation details. Most Studio node ids are reused directly as Puck `props.id` values, but Puck reserves the literal node id `root` for its synthetic editor root.

Puck 0.22 indexes user content and its synthetic root in the same internal node space and special-cases any component whose id is `root`. Passing a canonical Studio node with `id: "root"` through unchanged therefore corrupts Puck's editor indexes. The adapter boundary aliases only reserved ids while the editor is active:

```text
Studio canonical id: root
        |
        v
Puck editor id:      vira~root
        |
        v
Studio canonical id: root
```

The `vira~` alias cannot be a canonical Studio semantic id and contains no `:`, so it cannot collide with Studio ids or Puck's `parentId:slot` zone encoding. Authoring sessions keep the mapping bidirectional so canvas selections, Layers, Data, Actions and trusted renderer contexts continue to expose canonical Studio ids.

Puck may also generate ids for newly inserted components that do not satisfy Studio's semantic node-id grammar. Those ids never pass through implicitly. `importPuckDataIntoStudioDocument` still requires an explicit deterministic mapping before an arbitrary Puck-generated node can become canonical Studio data.

This keeps both Puck-reserved and Puck-generated implementation identifiers out of Vira's public authoring format.
