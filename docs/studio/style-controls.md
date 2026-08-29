# Studio human style controls

Vira uses Puck for the visual editor surface but keeps styling as a Vira-owned safe vocabulary. Human authors can visually customize an experience without receiving a raw CSS or code escape hatch.

```text
Brand component catalog
        +
Studio design enablement
        ↓
Puck property panel
        ↓
color / font / spacing / radius / shadow / layout
        ↓
ordinary canonical Studio props
        ↓
preview + publish validation
        ↓
StudioPublication
```

## Enable design controls

A host starts from its existing component catalog and explicitly enables design controls:

```ts
const studioCatalog = createStudioDesignCatalog(baseCatalog, {
  colorMode: "any",
  fonts: ["Inter", "Geist", "Pegasus Sans"],
  allowGradient: true,
});
```

`colorMode: "any"` means any valid `#RRGGBB` value. A brand can instead use `colorMode: "palette"` with an explicit `colors` array. Fonts are always selected from the registered list; Studio does not load remote font URLs.

The helper appends reserved, non-bindable props to selected components. StudioDocument itself does not gain editor-specific fields and Puck data does not become a runtime contract.

## Author controls

The first bounded vocabulary includes:

- text color;
- solid or linear-gradient background;
- registered font family;
- font size, weight, line height and letter spacing;
- padding and gap;
- border radius;
- shadow presets;
- text alignment;
- auto/full/fit width;
- block, row, column, two-column grid and three-column grid layout.

Puck renders colors through a custom color field and numeric values through native number fields with min/max/step metadata. Other choices use Puck select fields.

## Runtime safety

Design values are data. They are not CSS source text. The shared publish gate rejects malformed hex colors, out-of-range numeric values and incomplete gradients. Studio React resolves only known design prop keys, removes them before invoking the brand renderer, and applies the resulting bounded style to a wrapper element.

This is deliberately not a Figma-class freeform CSS engine. The goal is high visual freedom inside an enterprise-safe vocabulary. Responsive breakpoints, asset-backed backgrounds and richer effects can be layered later without widening the raw-code boundary.
