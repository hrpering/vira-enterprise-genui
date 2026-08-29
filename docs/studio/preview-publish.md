# Studio preview and publish gate

Studio keeps authoring and publishing separate:

```text
StudioDocument (draft)
      |
      | component + binding + action/flow validation
      v
StudioPublication (publishable immutable artifact)
```

`prepareStudioPublication()` refuses to compile a draft unless its component references, data bindings, component events, Action Adapter aliases, and routes all pass their owning validation gates.

`prepareStudioPreview()` applies the same publish gates and returns one editor-neutral view descriptor plus a view-scoped dependency manifest. The host Studio UI may render that descriptor using the same trusted brand renderer registry used by the Puck shell. The preview descriptor itself contains no renderer functions or executable code.

There is no hidden persistence, timestamp, revision generator, approval bypass, network request, or automatic deployment in this package. A host application remains responsible for storing drafts/publications and deciding who may publish them.
