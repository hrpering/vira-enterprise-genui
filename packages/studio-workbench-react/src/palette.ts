import type { StudioNode } from "@vira-enterprise-genui/studio-schema";

export interface StudioPaletteComponent {
  readonly ref: string;
  readonly slots: readonly { readonly name: string }[];
}

export interface StudioPaletteInsertionTarget {
  readonly zone: string;
  readonly index: number;
  readonly parentId?: string;
  readonly slot?: string;
}

function orderedNodes(
  nodes: readonly StudioNode[],
  parentId: string | undefined,
  slot: string | undefined,
): readonly StudioNode[] {
  return nodes
    .filter((node) => node.parentId === parentId && node.slot === slot)
    .toSorted((left, right) => left.order - right.order);
}

export function resolveStudioPaletteInsertionTarget(input: {
  readonly nodes: readonly StudioNode[];
  readonly components: readonly StudioPaletteComponent[];
  readonly selectedId?: string;
}): StudioPaletteInsertionTarget {
  const componentByRef = new Map(input.components.map((component) => [component.ref, component] as const));
  const selected = input.selectedId === undefined
    ? undefined
    : input.nodes.find((node) => node.id === input.selectedId);

  if (selected) {
    const selectedComponent = componentByRef.get(selected.component);
    const selectedSlot = selectedComponent?.slots[0]?.name;
    if (selectedSlot !== undefined) {
      return {
        zone: `${selected.id}:${selectedSlot}`,
        index: orderedNodes(input.nodes, selected.id, selectedSlot).length,
        parentId: selected.id,
        slot: selectedSlot,
      };
    }

    if (selected.parentId !== undefined && selected.slot !== undefined) {
      const siblings = orderedNodes(input.nodes, selected.parentId, selected.slot);
      const selectedIndex = siblings.findIndex((node) => node.id === selected.id);
      return {
        zone: `${selected.parentId}:${selected.slot}`,
        index: selectedIndex < 0 ? siblings.length : selectedIndex + 1,
        parentId: selected.parentId,
        slot: selected.slot,
      };
    }
  }

  const roots = orderedNodes(input.nodes, undefined, undefined);
  for (const root of roots) {
    const rootComponent = componentByRef.get(root.component);
    const rootSlot = rootComponent?.slots[0]?.name;
    if (rootSlot !== undefined) {
      return {
        zone: `${root.id}:${rootSlot}`,
        index: orderedNodes(input.nodes, root.id, rootSlot).length,
        parentId: root.id,
        slot: rootSlot,
      };
    }
  }

  return { zone: "root:default-zone", index: roots.length };
}
