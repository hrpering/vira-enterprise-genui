# Public Web SDK configuration

The Web SDK configuration boundary separates **validated semantic data** from **trusted executable host ports**.

Validated data is normalized once through existing owners:

- Component Adapter;
- Action Adapter;
- Runtime Core Permission Policy;
- Runtime Web Accessibility Policy;
- Runtime Web Container Responsive Policy.

Trusted executable integration consists only of the DOM Port and Action ID Factory. SDK configuration validates their required methods using property descriptors, does not execute getters/methods, and stores bound wrapper methods rather than retaining replaceable caller method properties.

This configuration step does not mount an experience, dispatch an action, execute an effect, read browser globals, or perform network/tool/model work. The next SDK layer consumes the normalized configuration to build the public `createViraGenUI` instance.
