import type { DesignTarget } from "../contracts/design.ts";

export type PlannedAiBlock = { id: string; type: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isValidAiCompletion(
  planned: readonly PlannedAiBlock[],
  design: unknown,
  target: DesignTarget = "email",
): boolean {
  if (!isRecord(design) || design.target !== target) return false;
  if (design.schemaVersion !== 1) return false;
  if (!isRecord(design.meta) || !isRecord(design.theme)) return false;
  if (!Array.isArray(design.blocks)) return false;
  if (planned.length === 0 || design.blocks.length !== planned.length) {
    return false;
  }

  const plannedTypes = new Map(planned.map((block) => [block.id, block.type]));
  if (plannedTypes.size !== planned.length) return false;

  const returnedIds = new Set<string>();
  for (const block of design.blocks) {
    if (!isRecord(block) || typeof block.id !== "string") return false;
    if (returnedIds.has(block.id)) return false;
    if (plannedTypes.get(block.id) !== block.type) return false;
    if (!isRecord(block.props)) return false;
    returnedIds.add(block.id);
  }

  if (returnedIds.size !== plannedTypes.size) return false;
  for (const id of plannedTypes.keys()) {
    if (!returnedIds.has(id)) return false;
  }
  return true;
}

export type AiStreamEnd =
  | { kind: "terminal" }
  | { kind: "failed-timeout" }
  | { kind: "failed-incomplete" }
  | { kind: "cancelled" };

export function resolveAiStreamEnd(input: {
  terminalReceived: boolean;
  timedOut: boolean;
  aborted: boolean;
}): AiStreamEnd {
  if (input.terminalReceived) return { kind: "terminal" };
  if (input.timedOut) return { kind: "failed-timeout" };
  if (input.aborted) return { kind: "cancelled" };
  return { kind: "failed-incomplete" };
}

export function isActiveAiEvent(
  eventRequestId: unknown,
  activeRequestId: string | null,
): boolean {
  return (
    typeof eventRequestId === "string" &&
    activeRequestId !== null &&
    eventRequestId === activeRequestId
  );
}
