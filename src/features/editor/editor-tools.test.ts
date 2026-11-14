import { describe, expect, it } from "vitest";
import { createExerciseTypes } from "../../core/model/exercise-type.js";
import { createLearnEditor } from "../../core/session/editor.js";
import { learnMessages } from "../../messages/en.js";
import { shortAnswer } from "../../test/test-types.js";
import { learnEditorTools, redoTool, removeExerciseTool, undoTool } from "./editor-tools.js";

const types = createExerciseTypes([shortAnswer]);
const payload = { questions: [{ prompt: "eat", accepted: ["กิน"] }] };
const initialContent = {
  format: "hm-learn-content",
  version: 1,
  exercises: [{ id: "a", type: "short-answer", payload }],
};

describe("learnEditorTools", () => {
  it("are labelled from the catalogue, with the family's undo, redo and delete shortcuts", () => {
    for (const tool of learnEditorTools) {
      expect(Object.hasOwn(learnMessages, tool.label), tool.label).toBe(true);
    }
    expect([undoTool.shortcuts, redoTool.shortcuts, removeExerciseTool.shortcuts]).toEqual([
      "undo",
      "redo",
      "delete",
    ]);
  });

  it("remove the selected exercise, which undo brings back", () => {
    const editor = createLearnEditor({ types, initialContent });
    const state = (selected: string | null) => ({ snapshot: editor.getSnapshot(), selected });
    expect(removeExerciseTool.isEnabled?.(state(null))).toBe(false);
    expect(removeExerciseTool.isEnabled?.(state("missing"))).toBe(false);
    expect([removeExerciseTool.isEnabled?.(state("a")), undoTool.isEnabled?.(state(null))]).toEqual(
      [true, false],
    );
    void removeExerciseTool.run({ editor, selected: "a" });
    expect(editor.getSnapshot().draft.exercises).toEqual([]);
    expect(undoTool.isEnabled?.(state(null))).toBe(true);
    void undoTool.run({ editor, selected: null });
    expect(editor.getSnapshot().draft.exercises).toHaveLength(1);
    expect(redoTool.isEnabled?.(state(null))).toBe(true);
    void redoTool.run({ editor, selected: null });
    expect(editor.getSnapshot().draft.exercises).toEqual([]);
  });
});
