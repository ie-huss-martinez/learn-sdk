import { createHistory, createStore } from "@hussmartinez/sdk-core";
import { isLearnError, type LearnError } from "../errors/learn-error.js";
import type { LearnIssue } from "../errors/learn-issues.js";
import type { LearnLimitOverrides } from "../errors/learn-limits.js";
import type { ContentDraft, LearnCommand } from "../model/commands.js";
import { CONTENT_FORMAT, CONTENT_VERSION, type Content } from "../model/content.js";
import type { ExerciseTypes } from "../model/exercise-type.js";
import { applyLearnCommand } from "../operations/apply-command.js";
import { parseContent } from "../operations/parse-content.js";

/** The most undoable steps the editor keeps (ADR 0007). */
const MAX_STEPS = 500;

/**
 * The editor's state, as {@link LearnEditor.getSnapshot} returns it. A new
 * object after every change.
 *
 * @public
 */
export interface LearnEditorSnapshot {
  readonly draft: ContentDraft;
  /** The draft's problems, each with the path to its field, as `parseContent` finds them. */
  readonly issues: readonly LearnIssue[];
  /** A problem with the whole draft rather than a field, such as a limit it exceeds. */
  readonly error: LearnError | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Whether the earliest edits were dropped from the history, so they can't be undone. */
  readonly trimmed: boolean;
}

/**
 * A usage event (ADR 0003): names only, never content or ids.
 *
 * @public
 */
export type LearnEditorEvent =
  | { readonly type: "content_edited"; readonly command: LearnCommand["type"] }
  | { readonly type: "edit_undone" }
  | { readonly type: "edit_redone" };

/**
 * Settings for {@link createLearnEditor}.
 *
 * @public
 */
export interface LearnEditorOptions {
  /** Valid `hm-learn-content`, as JSON text or a value. Without it, the editor starts empty. */
  readonly initialContent?: unknown;
  readonly types: ExerciseTypes;
  readonly limits?: LearnLimitOverrides;
  /** Makes an id for a new exercise. Defaults to a random UUID. */
  readonly newId?: () => string;
  /** Called with the draft and its issues after every edit, undo and redo. */
  readonly onChange?: (
    draft: ContentDraft,
    problems: { readonly issues: readonly LearnIssue[] },
  ) => void;
  readonly onEvent?: (event: LearnEditorEvent) => void;
}

/**
 * A teacher's editor session (ADR 0007), headless: a draft changed only by
 * `hm-learn-commands` commands, with undo and redo.
 *
 * @public
 */
export interface LearnEditor {
  getSnapshot(): LearnEditorSnapshot;
  subscribe(listener: () => void): () => void;
  /**
   * Applies a command as one undoable step.
   *
   * @throws `LearnError` with `INVALID_COMMAND`, changing nothing.
   */
  execute(command: LearnCommand): void;
  /** Makes every command executed while `fn` runs one undoable step, such as a burst of typing. */
  group<T>(fn: () => T): T;
  undo(): void;
  redo(): void;
  /**
   * The draft as validated content, for publishing.
   *
   * @throws `LearnError` with `INVALID_DOCUMENT` and every issue, or a limit's code.
   */
  getContent(): Content;
  /** An id for a new exercise, from `newId`. */
  newExerciseId(): string;
}

/** A version 4 UUID from `crypto.getRandomValues`, which, unlike `randomUUID`, works outside secure contexts. */
function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Creates a teacher's editor session (ADR 0007). It opens valid content
 * only, through `parseContent`; while the teacher works, the draft may be
 * invalid, and the snapshot lists its issues, found after every edit by the
 * same validators. `getContent()` publishes it once it's valid.
 *
 * Every edit is an `hm-learn-commands` command through
 * {@link applyLearnCommand}, kept with its inverse in sdk-core's history: at
 * most 500 steps, after which the earliest are dropped and `trimmed` is set.
 *
 * @throws `LearnError` when `initialContent` isn't valid, as `parseContent` does.
 * @public
 */
export function createLearnEditor(options: LearnEditorOptions): LearnEditor {
  const parseOptions = {
    types: options.types,
    ...(options.limits ? { limits: options.limits } : {}),
  };
  const initial: ContentDraft =
    options.initialContent === undefined
      ? { format: CONTENT_FORMAT, version: CONTENT_VERSION, exercises: [] }
      : parseContent(options.initialContent, parseOptions);
  const history = createHistory<LearnCommand>();

  const check = (draft: ContentDraft): Pick<LearnEditorSnapshot, "issues" | "error"> => {
    try {
      parseContent(draft, parseOptions);
      return { issues: [], error: null };
    } catch (error) {
      if (isLearnError(error, "INVALID_DOCUMENT")) {
        const issues =
          (error.details as { issues?: readonly LearnIssue[] } | undefined)?.issues ?? [];
        return { issues, error: null };
      }
      if (isLearnError(error)) {
        return { issues: [], error };
      }
      throw error;
    }
  };
  const snapshotOf = (draft: ContentDraft): LearnEditorSnapshot => ({
    draft,
    ...check(draft),
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    trimmed: history.trimmed,
  });
  const store = createStore(snapshotOf(initial));

  const show = (draft: ContentDraft) => {
    const snapshot = snapshotOf(draft);
    store.set(snapshot);
    options.onChange?.(snapshot.draft, { issues: snapshot.issues });
  };
  const apply = (draft: ContentDraft, commands: readonly LearnCommand[]): ContentDraft =>
    commands.reduce(
      (state, command) => applyLearnCommand(state, command, parseOptions).state,
      draft,
    );

  function replay(direction: "undo" | "redo") {
    const step = direction === "undo" ? history.undo() : history.redo();
    if (!step) {
      return;
    }
    let draft: ContentDraft;
    try {
      draft = apply(
        store.getSnapshot().draft,
        direction === "undo" ? step.inverses : step.commands,
      );
    } catch (error) {
      history.restore(direction);
      throw error;
    }
    show(draft);
    options.onEvent?.({ type: direction === "undo" ? "edit_undone" : "edit_redone" });
  }

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    execute(command) {
      const applied = applyLearnCommand(store.getSnapshot().draft, command, parseOptions);
      history.push({ commands: [applied.command], inverses: [applied.inverse] });
      if (history.steps.length > MAX_STEPS) {
        history.drop(history.steps.length - MAX_STEPS);
      }
      show(applied.state);
      options.onEvent?.({ type: "content_edited", command: applied.command.type });
    },
    group: (fn) => history.group(fn),
    undo() {
      replay("undo");
    },
    redo() {
      replay("redo");
    },
    getContent() {
      return parseContent(store.getSnapshot().draft, parseOptions);
    },
    newExerciseId() {
      return (options.newId ?? randomId)();
    },
  };
}
