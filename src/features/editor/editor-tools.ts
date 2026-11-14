import { defineTool, type Tool } from "@hussmartinez/sdk-core";
import type { LearnEditor, LearnEditorSnapshot } from "../../core/session/editor.js";

/**
 * What an editor tool reads: the editor's snapshot, and the exercise the
 * teacher has selected, which the editor component keeps.
 *
 * @public
 */
export interface LearnEditorToolState {
  readonly snapshot: LearnEditorSnapshot;
  readonly selected: string | null;
}

/**
 * What an editor tool acts on.
 *
 * @public
 */
export interface LearnEditorToolContext {
  readonly editor: LearnEditor;
  readonly selected: string | null;
}

/**
 * One of the editor's actions as a tool (ADR 0007, sdk-core ADR 0030).
 *
 * @public
 */
export type LearnEditorTool = Tool<LearnEditorToolState, LearnEditorToolContext, undefined>;

/**
 * Undoes the last step.
 *
 * @public
 */
export const undoTool: LearnEditorTool = /* @__PURE__ */ defineTool({
  id: "learn.undo",
  label: "tools.undo",
  icon: "undo",
  group: "history",
  isEnabled: ({ snapshot }) => snapshot.canUndo,
  run: ({ editor }) => {
    editor.undo();
  },
  shortcuts: "undo",
});

/**
 * Redoes the last undone step.
 *
 * @public
 */
export const redoTool: LearnEditorTool = /* @__PURE__ */ defineTool({
  id: "learn.redo",
  label: "tools.redo",
  icon: "redo",
  group: "history",
  isEnabled: ({ snapshot }) => snapshot.canRedo,
  run: ({ editor }) => {
    editor.redo();
  },
  shortcuts: "redo",
});

/**
 * Removes the selected exercise at once; undo brings it back (ADR 0007).
 *
 * @public
 */
export const removeExerciseTool: LearnEditorTool = /* @__PURE__ */ defineTool({
  id: "learn.remove-exercise",
  label: "tools.remove-exercise",
  icon: "delete",
  group: "exercises",
  isEnabled: ({ snapshot, selected }) =>
    selected !== null && snapshot.draft.exercises.some((exercise) => exercise.id === selected),
  run: ({ editor, selected }) => {
    if (selected !== null) {
      editor.execute({ type: "learn.removeExercise", exerciseId: selected });
    }
  },
  shortcuts: "delete",
});

/**
 * The editor's tools that need no more than a selection. Adding and moving
 * exercises need a type picker and a target from the editor component, so
 * their tools come with it.
 *
 * @public
 */
export const learnEditorTools: readonly LearnEditorTool[] = [
  undoTool,
  redoTool,
  removeExerciseTool,
];
