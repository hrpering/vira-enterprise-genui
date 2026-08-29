import { defineConfig } from "vite";

const unsafeDraggedItemRead = "draggedItem?.data.componentType";
const safeDraggedItemRead = "draggedItem?.data?.componentType";

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
        if (!id.includes("@puckeditor/core")) return null;
        if (!code.includes(unsafeDraggedItemRead)) return null;

        return {
          code: code.replaceAll(unsafeDraggedItemRead, safeDraggedItemRead),
          map: null,
        };
      },
    },
  ],
});
