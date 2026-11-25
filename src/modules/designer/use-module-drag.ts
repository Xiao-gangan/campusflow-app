import { useState, type DragEvent } from "react";

export type DropPosition = "before" | "after";

export function useModuleDrag(
  onReorder?: (
    activeId: string,
    overId: string,
    position: DropPosition,
  ) => void,
) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: DropPosition;
  } | null>(null);

  function onDragStart(event: DragEvent<HTMLElement>, id: string) {
    if (!onReorder) return;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    const block = (event.currentTarget as HTMLElement).closest(
      "[data-module-id]",
    ) as HTMLElement | null;
    if (block) {
      try {
        event.dataTransfer.setDragImage(
          block,
          20,
          Math.min(40, block.getBoundingClientRect().height / 2),
        );
      } catch {
        // Constructed DataTransfer objects (automation, older browsers) may
        // not expose setDragImage; dragging still works without a custom ghost.
      }
    }
    setDraggingId(id);
    setDropTarget(null);
  }

  function onDragOver(event: DragEvent<HTMLElement>, id: string) {
    if (!onReorder || !draggingId || draggingId === id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const position: DropPosition =
      event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropTarget((current) =>
      current?.id === id && current.position === position
        ? current
        : { id, position },
    );
  }

  function onDrop(event: DragEvent<HTMLElement>, id: string) {
    if (!onReorder) return;
    event.preventDefault();
    const activeId =
      event.dataTransfer.getData("text/plain") || draggingId || "";
    if (activeId && activeId !== id && dropTarget) {
      onReorder(activeId, id, dropTarget.position);
    }
    setDraggingId(null);
    setDropTarget(null);
  }

  function onDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  function dropClass(id: string): string {
    if (dropTarget?.id !== id) return "";
    return `module-drop-${dropTarget.position}`;
  }

  return {
    draggingId,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    dropClass,
    isDragging: (id: string) => draggingId === id,
  };
}
