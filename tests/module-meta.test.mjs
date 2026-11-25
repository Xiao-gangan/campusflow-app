import test from "node:test";
import assert from "node:assert/strict";
import {
  MODULE_LIST,
  getModuleById,
  getModuleByPath,
} from "../src/app/module-meta.ts";
import { ROUTES } from "../src/app/navigation.ts";

test("module ids and paths are unique", () => {
  const ids = MODULE_LIST.map((module) => module.id);
  const paths = MODULE_LIST.map((module) => module.path);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(paths).size, paths.length);
  assert.deepEqual(ids, ["recruitment"]);
});

test("every module points at a registered app route", () => {
  for (const module of MODULE_LIST) {
    assert.equal(ROUTES.includes(module.path), true);
    assert.ok(module.eyebrow.length > 0);
  }
});

test("module lookup works by id and by path", () => {
  assert.equal(getModuleById("recruitment")?.name, "招新管理");
  assert.equal(getModuleByPath("/recruitment"), getModuleById("recruitment"));
  assert.equal(getModuleByPath("/scheduling"), undefined);
  assert.equal(getModuleById("scheduling"), undefined);
  assert.equal(getModuleByPath("/"), undefined);
});
