import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createLocalEmailRepository } from "./email-repository-core.ts";
export * from "./email-repository-core.ts";

export function openLocalEmailRepository(filename: string) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  return createLocalEmailRepository(new DatabaseSync(filename));
}
