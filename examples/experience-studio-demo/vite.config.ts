import { defineConfig } from "vite";

const unsafeDraggedItemRead = /draggedItem\?\.\s*data\.componentType/g;

function isPuckCoreModule(id: string): boolean {
  return id.includes("@puckeditor/core") || id.includes("@puckeditor+core");
}

function guardPuckDraggedItem(code: string, id: string) {
  if (!isPuckCoreModule(id)) return null;

  unsafeDraggedItemRead.lastIndex = 0;
  if (!unsafeDraggedItemRead.test(code)) return null;
  unsafeDraggedItemRead.lastIndex = 0;

  return {
    code: code.replace(unsafeDraggedItemRead, "draggedItem?.data?.componentType"),
    map: null,
  };
}

export default defineConfig({
  optimizeDeps: {
    // Keep Puck pre-bundled so its transitive DnD packages are not served raw.
    // Apply the narrow compatibility guard inside Vite's dependency optimizer.
    rolldownOptions: {
      plugins: [
        {
          name: "vira-puck-dragged-item-guard-optimize",
          transform: guardPuckDraggedItem,
        },
      ],
    },
  },
  plugins: [
    {
      name: "vira-puck-dragged-item-guard-build",
      enforce: "pre",
      transform: guardPuckDraggedItem,
    },
  ],
});
