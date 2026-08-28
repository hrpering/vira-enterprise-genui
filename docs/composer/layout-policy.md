# Layout Policy

Layout Policy names the semantic layout family that Composer may use for an experience. It does not encode CSS geometry.

Supported MVP families:

- `single-focus`
- `flow`
- `split`
- `comparison`
- `master-detail`
- `stepper`
- `results-list`
- `summary-action`
- `timeline`
- `dashboard`

The policy is explicit: `{ family: "..." }`. Composer does not silently select `auto`, infer a family from a brand, or rank alternatives with a model.

A layout family describes broad information organization only. It carries no columns, widths, gaps, breakpoints, CSS classes, DOM templates, components, or brand styling. Responsive geometry belongs to Runtime Web and concrete component/brand adapters later.
