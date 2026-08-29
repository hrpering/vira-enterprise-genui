import { defineConfig } from "vite";

const unsafeDraggedItemRead = /draggedItem\?\.\s*data\.componentType/g;

function isPuckCoreModule(id: string): boolean {
  return id.includes("@puckeditor/core") || id.includes("@puckeditor+core");
}

export default defineConfig({
  optimizeDeps: {
    // Puck 0.22.4 contains an unsafe ZoneStore selector that Vite would otherwise
    // hide inside the optimized dependency bundle before our compatibility transform.
    exclude: ["@puckeditor/core"],
  },
  plugins: [
    {
      name: "vira-puck-dragged-item-guard",
      enforce: "pre",
      transform(code, id) {
        if (!isPuckCoreModule(id)) return null;

        unsafeDraggedItemRead.lastIndex = 0;
        if (!unsafeDraggedItemRead.test(code)) return null;
        unsafeDraggedItemRead.lastIndex = 0;

        return {
          code: code.replace(unsafeDraggedItemRead, "draggedItem?.data?.componentType"),
          map: null,
        };
      },
    },
  ],
});
