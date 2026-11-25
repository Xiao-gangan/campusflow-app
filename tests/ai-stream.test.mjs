import test from "node:test";
import assert from "node:assert/strict";
import {
  isActiveAiEvent,
  isValidAiCompletion,
  resolveAiStreamEnd,
} from "../shared/ai/stream.ts";

const planned = [
  { id: "a", type: "heading" },
  { id: "b", type: "text" },
];

function designWith(blocks, overrides = {}) {
  return {
    schemaVersion: 1,
    target: "email",
    meta: {},
    theme: {},
    blocks,
    ...overrides,
  };
}

const validDesign = designWith([
  { id: "a", type: "heading", props: { text: "标题" } },
  { id: "b", type: "text", props: { text: "正文" } },
]);

test("a normal complete design passes regardless of block order", () => {
  assert.equal(isValidAiCompletion(planned, validDesign), true);
  assert.equal(
    isValidAiCompletion(planned, designWith([...validDesign.blocks].reverse())),
    true,
  );
});

test("duplicate returned ids are rejected even when the count is correct", () => {
  assert.equal(
    isValidAiCompletion(
      planned,
      designWith([
        { id: "a", type: "heading", props: { text: "标题" } },
        { id: "a", type: "heading", props: { text: "标题" } },
      ]),
    ),
    false,
  );
});

test("three planned blocks with one duplicate and one omission are rejected", () => {
  const three = [
    { id: "a", type: "heading" },
    { id: "b", type: "text" },
    { id: "c", type: "button" },
  ];
  assert.equal(
    isValidAiCompletion(
      three,
      designWith([
        { id: "a", type: "heading", props: {} },
        { id: "b", type: "text", props: {} },
        { id: "a", type: "heading", props: {} },
      ]),
    ),
    false,
  );
});

test("duplicate ids in the plan itself are rejected", () => {
  assert.equal(
    isValidAiCompletion(
      [
        { id: "a", type: "heading" },
        { id: "a", type: "heading" },
      ],
      designWith([
        { id: "a", type: "heading", props: {} },
        { id: "a", type: "heading", props: {} },
      ]),
    ),
    false,
  );
});

test("missing, unknown, mismatched and malformed blocks remain rejected", () => {
  assert.equal(
    isValidAiCompletion(planned, designWith(validDesign.blocks.slice(0, 1))),
    false,
  );
  assert.equal(
    isValidAiCompletion(
      planned,
      designWith([
        validDesign.blocks[0],
        { id: "b3", type: "text", props: {} },
      ]),
    ),
    false,
  );
  assert.equal(
    isValidAiCompletion(
      planned,
      designWith([
        validDesign.blocks[0],
        { id: "b", type: "button", props: {} },
      ]),
    ),
    false,
  );
  assert.equal(
    isValidAiCompletion(
      planned,
      designWith([
        validDesign.blocks[0],
        { id: "b", type: "text" },
      ]),
    ),
    false,
  );
  assert.equal(
    isValidAiCompletion(planned, designWith(validDesign.blocks, { target: "invite_page" })),
    false,
  );
  assert.equal(isValidAiCompletion([], designWith([])), false);
});

test("stream end distinguishes terminal, timeout, cancel and premature EOF", () => {
  assert.deepEqual(
    resolveAiStreamEnd({ terminalReceived: true, timedOut: true, aborted: true }),
    { kind: "terminal" },
  );
  assert.deepEqual(
    resolveAiStreamEnd({ terminalReceived: false, timedOut: true, aborted: true }),
    { kind: "failed-timeout" },
  );
  assert.deepEqual(
    resolveAiStreamEnd({ terminalReceived: false, timedOut: false, aborted: true }),
    { kind: "cancelled" },
  );
  assert.deepEqual(
    resolveAiStreamEnd({ terminalReceived: false, timedOut: false, aborted: false }),
    { kind: "failed-incomplete" },
  );
});

test("late events from an old request are ignored", () => {
  assert.equal(isActiveAiEvent("old", "new"), false);
  assert.equal(isActiveAiEvent("new", "new"), true);
  assert.equal(isActiveAiEvent(undefined, "new"), false);
  assert.equal(isActiveAiEvent("new", null), false);
});
