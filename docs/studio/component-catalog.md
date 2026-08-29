# Studio brand component catalog

The Studio component catalog is the serializable contract describing which brand-native UI building blocks may appear in Experience Studio and which authoring surfaces each block exposes.

It is deliberately **not** a React/Vue/Web Component registry. Executable implementations remain in trusted host integration code and never enter the catalog artifact.

## Contract boundary

A catalog contains:

- a semantic catalog id;
- a semantic brand id;
- exact semantic component references;
- display label/category/kind metadata for the editor palette;
- editable prop descriptors;
- declared child slots;
- declared component events.

A component definition contains no render function, callback, import path, URL, endpoint, HTML, CSS, JavaScript, iframe, or arbitrary expression.

## Safe prop surface

Studio MVP prop descriptors support only:

- `string`;
- `number`;
- `boolean`;
- bounded string `enum`.

Each prop explicitly declares whether it is required and whether it can receive a Studio data binding. There is no expression language or callback-valued prop.

## Document validation

`validateStudioDocumentAgainstCatalog(document, catalog)` first validates both owning contracts and then enforces exact catalog membership:

- every Studio node uses a registered component ref;
- every static prop is declared and type-compatible;
- required props are supplied either statically or by one valid binding;
- a prop cannot be both static and bound;
- bindings may target only declared bindable props;
- nested nodes may target only slots declared by their parent component;
- interactions may use only events declared by the component.

Action-event authorization, data-source authorization, component implementation resolution, and runtime execution remain later independent gates.

## Pegasus example

```text
Pegasus catalog
  pegasus.layout.stack
    slot: content

  pegasus.component.airport-picker
    props: label, value(bindable)
    event: change

  pegasus.component.flight-list
    props: items(bindable), variant(enum)
    event: select

  pegasus.component.button
    props: label, disabled(bindable)
    event: press
```

The Studio can use this metadata to build the palette and property panel. A later Puck adapter translates the same safe metadata into Puck editor configuration while concrete Pegasus React components remain outside the canonical catalog.
