import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createAgentStore } from "./store-core.ts";
export type { AgentStore } from "./store-core.ts";

export function openAgentStore(file: string, clock = () => new Date()) {
  return createAgentStore(new DatabaseSync(file), (input) => createHash("sha256").update(input).digest("hex"), clock);
}
