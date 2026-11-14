import { describe, expect, it } from "vitest";
import { shortAnswer } from "../../test/test-types.js";
import { isLearnError } from "../errors/learn-error.js";
import type { ContentDraft, LearnCommand } from "../model/commands.js";
import { createExerciseTypes } from "../model/exercise-type.js";
import { applyLearnCommand } from "./apply-command.js";

const types = createExerciseTypes([shortAnswer]);
const exercise = (id: string, payload: object = { questions: [] }) => ({
  id,
  type: "short-answer",
  payload,
});
const draft = (...ids: string[]): ContentDraft => ({
  format: "hm-learn-content",
  version: 1,
  exercises: ids.map((id) => exercise(id)),
});
const BASE = draft("a", "b", "c");
const ids = (state: ContentDraft) => state.exercises.map((current) => current.id);

function apply(command: unknown, state: ContentDraft = BASE, limits?: Record<string, number>) {
  return applyLearnCommand(state, command, { types, ...(limits ? { limits } : {}) });
}

function refusal(command: unknown, state: ContentDraft = BASE, limits?: Record<string, number>) {
  try {
    apply(command, state, limits);
  } catch (error) {
    if (isLearnError(error, "INVALID_COMMAND")) return error.details;
    throw error;
  }
  throw new Error("expected INVALID_COMMAND");
}

/** Applies a command, then its inverse, which must restore the draft exactly. */
function roundTrip(command: LearnCommand, state: ContentDraft = BASE) {
  const applied = apply(command, state);
  expect(apply(applied.inverse, applied.state).state).toEqual(state);
  return applied.state;
}

describe("applyLearnCommand", () => {
  it("adds, removes, moves and edits exercises, each undone by its inverse", () => {
    expect(ids(roundTrip({ type: "learn.addExercise", exercise: exercise("d"), at: 1 }))).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
    expect(ids(roundTrip({ type: "learn.addExercise", exercise: exercise("d"), at: 3 }))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(ids(roundTrip({ type: "learn.removeExercise", exerciseId: "b" }))).toEqual(["a", "c"]);
    expect(ids(roundTrip({ type: "learn.moveExercise", exerciseId: "a", to: 2 }))).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(ids(roundTrip({ type: "learn.moveExercise", exerciseId: "c", to: 0 }))).toEqual([
      "c",
      "a",
      "b",
    ]);
    const titled = roundTrip({
      type: "learn.setExerciseText",
      exerciseId: "b",
      field: "title",
      value: "อาหาร",
    });
    expect(titled.exercises[1]).toEqual({
      id: "b",
      type: "short-answer",
      title: "อาหาร",
      payload: { questions: [] },
    });
    const untitled = roundTrip(
      { type: "learn.setExerciseText", exerciseId: "b", field: "title", value: null },
      titled,
    );
    expect(Object.keys(untitled.exercises[1] ?? {})).toEqual(["id", "type", "payload"]);
    const payload = { questions: [{ prompt: "", accepted: [] }] };
    expect(
      roundTrip({ type: "learn.setPayload", exerciseId: "c", payload }).exercises[2]?.payload,
    ).toEqual(payload);
  });

  it("never changes the draft it's given, nor keeps the caller's command", () => {
    const command = { type: "learn.setPayload", exerciseId: "a", payload: { questions: ["x"] } };
    const before = JSON.stringify(BASE);
    const { state } = apply(command);
    command.payload.questions.push("y");
    expect(state.exercises[0]?.payload).toEqual({ questions: ["x"] });
    expect(JSON.stringify(BASE)).toBe(before);
  });

  it("refuses each kind of problem with its reason, naming only the command's type", () => {
    const sparse: number[] = [];
    sparse[0] = 1;
    sparse[2] = 3;
    const cases: [unknown, string, ContentDraft?, Record<string, number>?][] = [
      [{ type: "learn.renameAll" }, "unknown-command"],
      [{ type: "__proto__" }, "unknown-command"],
      [{ exerciseId: "a" }, "malformed-command"],
      [null, "malformed-command"],
      [{ type: "learn.removeExercise", exerciseId: "a", extra: 1 }, "malformed-command"],
      [{ type: "learn.removeExercise" }, "malformed-command"],
      [{ type: "learn.removeExercise", exerciseId: " " }, "malformed-command"],
      [{ type: "learn.moveExercise", exerciseId: "a", to: 1.5 }, "malformed-command"],
      [{ type: "learn.moveExercise", exerciseId: "a", to: -1 }, "malformed-command"],
      [
        { type: "learn.setExerciseText", exerciseId: "a", field: "id", value: "x" },
        "malformed-command",
      ],
      [
        { type: "learn.setExerciseText", exerciseId: "a", field: "title", value: "" },
        "malformed-command",
      ],
      [{ type: "learn.setPayload", exerciseId: "a", payload: [] }, "malformed-command"],
      [
        { type: "learn.setPayload", exerciseId: "a", payload: { when: new Date(0) } },
        "malformed-command",
      ],
      [
        { type: "learn.setPayload", exerciseId: "a", payload: { n: Number.NaN } },
        "malformed-command",
      ],
      [{ type: "learn.setPayload", exerciseId: "a", payload: { f: () => 1 } }, "malformed-command"],
      [
        { type: "learn.setPayload", exerciseId: "a", payload: { list: sparse } },
        "malformed-command",
      ],
      [
        { type: "learn.addExercise", exercise: { id: "d", type: "short-answer" }, at: 0 },
        "malformed-command",
      ],
      [{ type: "learn.removeExercise", exerciseId: "z" }, "unknown-exercise"],
      [{ type: "learn.addExercise", exercise: exercise("b"), at: 0 }, "duplicate-id"],
      [
        { type: "learn.addExercise", exercise: { ...exercise("d"), type: "essay" }, at: 0 },
        "unknown-type",
      ],
      [{ type: "learn.addExercise", exercise: exercise("d"), at: 4 }, "position-out-of-range"],
      [{ type: "learn.moveExercise", exerciseId: "a", to: 3 }, "position-out-of-range"],
      [
        { type: "learn.addExercise", exercise: exercise("d"), at: 0 },
        "too-many-exercises",
        BASE,
        { maxExercises: 3 },
      ],
    ];
    // A value structuredClone can't copy is refused before its type is read.
    const uncloneable = (command: unknown) =>
      typeof (command as { payload?: { f?: unknown } } | null)?.payload?.f === "function";
    for (const [command, reason, state, limits] of cases) {
      const details = refusal(command, state, limits);
      expect(details?.["reason"], JSON.stringify(command) ?? String(command)).toBe(reason);
      const type = (command as { type?: string } | null)?.type;
      expect(details?.["command"]).toBe(
        reason === "unknown-command" || type === undefined || uncloneable(command)
          ? undefined
          : type,
      );
    }
  });

  it("refuses JSON nested deeper than any payload needs", () => {
    let deep: unknown = "x";
    for (let depth = 0; depth < 70; depth++) deep = [deep];
    expect(
      refusal({ type: "learn.setPayload", exerciseId: "a", payload: { deep } })?.["reason"],
    ).toBe("malformed-command");
  });

  it("counts every text in code points, including texts and keys inside a payload", () => {
    const emoji = (count: number) => "😀".repeat(count);
    const command = (value: string) => ({
      type: "learn.setExerciseText",
      exerciseId: "a",
      field: "title",
      value,
    });
    expect(apply(command(emoji(2_000))).state.exercises[0]?.title).toBe(emoji(2_000));
    expect(refusal(command(emoji(2_001)))?.["reason"]).toBe("text-too-long");
    const payload = (value: object) => ({
      type: "learn.setPayload",
      exerciseId: "a",
      payload: value,
    });
    expect(refusal(payload({ questions: [{ prompt: emoji(2_001) }] }))?.["reason"]).toBe(
      "text-too-long",
    );
    expect(refusal(payload({ [emoji(2_001)]: 1 }))?.["reason"]).toBe("text-too-long");
    expect(refusal(command(emoji(11)), BASE, { maxTextLength: 10 })?.["reason"]).toBe(
      "text-too-long",
    );
  });

  it("treats ids such as __proto__, constructor and toString as ordinary ids", () => {
    let state = draft();
    for (const id of ["__proto__", "constructor", "toString"]) {
      state = apply(
        { type: "learn.addExercise", exercise: exercise(id), at: state.exercises.length },
        state,
      ).state;
    }
    expect(ids(state)).toEqual(["__proto__", "constructor", "toString"]);
    expect(
      refusal({ type: "learn.addExercise", exercise: exercise("__proto__"), at: 0 }, state)?.[
        "reason"
      ],
    ).toBe("duplicate-id");
    expect(
      refusal({ type: "learn.removeExercise", exerciseId: "hasOwnProperty" }, state)?.["reason"],
    ).toBe("unknown-exercise");
    const hostile = JSON.parse(
      '{"type":"learn.setPayload","exerciseId":"__proto__","payload":{"__proto__":{"x":1},"constructor":1}}',
    );
    const payload = apply(hostile, state).state.exercises[0]?.payload as object;
    expect(Object.keys(payload)).toEqual(["__proto__", "constructor"]);
    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype);
    expect(({} as { x?: number }).x).toBeUndefined();
  });
});
