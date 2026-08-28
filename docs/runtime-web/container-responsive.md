# Runtime Web container responsiveness

Enterprise GenUI is commonly embedded in chat columns, assistant sidebars, split panes, dashboards, and full-page surfaces. Runtime Web therefore treats the **embedding container** as the responsive boundary rather than the browser viewport.

A Responsive Policy contains an explicit ordered set of semantic bands such as:

```text
compact  -> 0px+
regular  -> 420px+
wide     -> 760px+
```

`resolveResponsiveBand` receives a measured container inline size and deterministically returns the highest band whose minimum threshold is satisfied.

The contract does not read `window.innerWidth`, inspect user agents/devices, generate media queries, emit CSS classes, mutate DOM, or choose component props. Concrete browser integration later supplies container measurements and applies the semantic band using approved host components/layout behavior.
