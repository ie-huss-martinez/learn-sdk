import { describe, expect, it } from "vitest";
import { shortAnswer } from "../../test/test-types.js";
import type { ContentDraft, LearnCommand } from "../model/commands.js";
import { createExerciseTypes } from "../model/exercise-type.js";
import { createLearnEditor, type LearnEditorEvent, type LearnEditorOptions } from "./editor.js";

const MARKER = "MARKER-51c2";
const types = createExerciseTypes([shortAnswer]);
const valid = (id: string, prompt = "eat") => ({
  id,
  type: "short-answer",
  payload: { questions: [{ prompt, accepted: ["กิน"] }] },
});
const content = { format: "hm-learn-content", version: 1, exercises: [valid("a"), valid("b")] };
const add = (id: string, at: number, payload: object = { questions: [] }): LearnCommand => ({
  type: "learn.addExercise",
  exercise: { id, type: "short-answer", payload },
  at,
});

function setup(overrides: Partial<LearnEditorOptions> = {}) {
  const changes: ContentDraft[] = [];
  const events: LearnEditorEvent[] = [];
  const editor = createLearnEditor({
    initialContent: content,
    types,
    onChange: (draft) => changes.push(draft),
    onEvent: (event) => events.push(event),
    ...overrides,
  });
  return { editor, changes, events };
}
const ids = (draft: ContentDraft) => draft.exercises.map((exercise) => exercise.id);

describe("createLearnEditor", () => {
  it("opens valid content, or starts empty, and refuses invalid content", () => {
    expect(ids(setup().editor.getSnapshot().draft)).toEqual(["a", "b"]);
    const empty = createLearnEditor({ types }).getSnapshot();
    expect(empty).toMatchObject({
      draft: { format: "hm-learn-content", version: 1, exercises: [] },
      issues: [],
    });
    expect([empty.canUndo, empty.canRedo, empty.trimmed, empty.error]).toEqual([
      false,
      false,
      false,
      null,
    ]);
    expect(() =>
      createLearnEditor({
        types,
        initialContent: { ...content, exercises: [valid("a"), valid("a")] },
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_DOCUMENT" }));
  });

  it("keeps an invalid draft, lists its issues by path, and only publishes valid content", () => {
    const { editor, changes } = setup();
    editor.execute(add("c", 2));
    const snapshot = editor.getSnapshot();
    expect(ids(snapshot.draft)).toEqual(["a", "b", "c"]);
    expect(snapshot.issues).toContainEqual(
      expect.objectContaining({ path: ["exercises", 2, "payload", "questions"], code: "too-few" }),
    );
    expect(changes).toEqual([snapshot.draft]);
    expect(() => editor.getContent()).toThrow(
      expect.objectContaining({ code: "INVALID_DOCUMENT" }),
    );
    editor.execute({ type: "learn.setPayload", exerciseId: "c", payload: valid("c").payload });
    expect(editor.getSnapshot().issues).toEqual([]);
    expect(ids(editor.getContent())).toEqual(["a", "b", "c"]);
  });

  it("reports a limit the whole draft exceeds as its error", () => {
    const { editor } = setup({ limits: { maxItems: 1 } });
    editor.execute({
      type: "learn.setPayload",
      exerciseId: "a",
      payload: { questions: [valid("x").payload.questions[0], valid("y").payload.questions[0]] },
    });
    expect(editor.getSnapshot()).toMatchObject({ issues: [], error: { code: "TOO_MANY_ITEMS" } });
  });

  it("refuses an invalid command without changing anything", () => {
    const { editor, changes, events } = setup();
    const before = editor.getSnapshot();
    expect(() => editor.execute({ type: "learn.removeExercise", exerciseId: "z" })).toThrow(
      expect.objectContaining({ code: "INVALID_COMMAND" }),
    );
    expect([editor.getSnapshot(), changes, events]).toEqual([before, [], []]);
  });

  it("undoes and redoes each step, and groups a burst of commands into one", () => {
    const { editor, events } = setup();
    editor.execute({ type: "learn.removeExercise", exerciseId: "a" });
    editor.group(() => {
      editor.execute({
        type: "learn.setExerciseText",
        exerciseId: "b",
        field: "title",
        value: "F",
      });
      editor.execute({
        type: "learn.setExerciseText",
        exerciseId: "b",
        field: "title",
        value: "Fo",
      });
      editor.execute({
        type: "learn.setExerciseText",
        exerciseId: "b",
        field: "title",
        value: "Food",
      });
    });
    editor.undo();
    expect(editor.getSnapshot().draft.exercises).toEqual([valid("b")]);
    editor.undo();
    expect(editor.getSnapshot().draft.exercises).toEqual(content.exercises);
    expect(editor.getSnapshot()).toMatchObject({ canUndo: false, canRedo: true });
    editor.redo();
    editor.redo();
    expect(editor.getSnapshot().draft.exercises).toEqual([{ ...valid("b"), title: "Food" }]);
    editor.undo();
    editor.execute(add("c", 0));
    expect(editor.getSnapshot().canRedo).toBe(false);
    expect(events.map((event) => event.type)).toEqual([
      "content_edited",
      "content_edited",
      "content_edited",
      "content_edited",
      "edit_undone",
      "edit_undone",
      "edit_redone",
      "edit_redone",
      "edit_undone",
      "content_edited",
    ]);
  });

  it("keeps at most 500 steps, and says when earlier ones were dropped", () => {
    const { editor } = setup();
    for (let index = 0; index < 501; index++) {
      editor.execute({
        type: "learn.setExerciseText",
        exerciseId: "a",
        field: "title",
        value: `t${index}`,
      });
    }
    expect(editor.getSnapshot().trimmed).toBe(true);
    let undone = 0;
    while (editor.getSnapshot().canUndo) {
      editor.undo();
      undone += 1;
    }
    expect(undone).toBe(500);
    expect(editor.getSnapshot().draft.exercises[0]?.title).toBe("t0");
  });

  it("makes ids for new exercises from newId, or random UUIDs", () => {
    expect(setup({ newId: () => "fixed" }).editor.newExerciseId()).toBe("fixed");
    const { editor } = setup();
    const id = editor.newExerciseId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(editor.newExerciseId()).not.toBe(id);
  });

  it("never puts content text or ids in its events", () => {
    const { editor, events } = setup();
    editor.execute({
      type: "learn.setExerciseText",
      exerciseId: "a",
      field: "title",
      value: MARKER,
    });
    editor.execute(add(MARKER, 0));
    editor.undo();
    const leaked = JSON.stringify(events);
    expect(leaked).not.toContain(MARKER);
    expect(leaked).not.toContain('"a"');
  });
});
