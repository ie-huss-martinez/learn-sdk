import type { CONTENT_FORMAT, CONTENT_VERSION, Exercise } from "./content.js";

/**
 * The editor's document while a teacher works on it (ADR 0007): shaped as
 * `hm-learn-content`, but possibly invalid, such as a new exercise with an
 * empty prompt. `parseContent` turns it into content once it's valid.
 *
 * @public
 */
export interface ContentDraft {
  readonly format: typeof CONTENT_FORMAT;
  readonly version: typeof CONTENT_VERSION;
  readonly exercises: readonly Exercise[];
}

/**
 * Adds an exercise at a position, from 0 to the number of exercises.
 *
 * @public
 */
export interface AddExerciseCommand {
  readonly type: "learn.addExercise";
  readonly exercise: Exercise;
  readonly at: number;
}

/**
 * Removes an exercise.
 *
 * @public
 */
export interface RemoveExerciseCommand {
  readonly type: "learn.removeExercise";
  readonly exerciseId: string;
}

/**
 * Moves an exercise to a position among the others.
 *
 * @public
 */
export interface MoveExerciseCommand {
  readonly type: "learn.moveExercise";
  readonly exerciseId: string;
  readonly to: number;
}

/**
 * Sets an exercise's title or instructions, or removes it with `null`.
 *
 * @public
 */
export interface SetExerciseTextCommand {
  readonly type: "learn.setExerciseText";
  readonly exerciseId: string;
  readonly field: "title" | "instructions";
  readonly value: string | null;
}

/**
 * Replaces an exercise's payload, as its type's editor builds it.
 *
 * @public
 */
export interface SetPayloadCommand {
  readonly type: "learn.setPayload";
  readonly exerciseId: string;
  readonly payload: object;
}

/**
 * An edit to a {@link ContentDraft}: the `hm-learn-commands` format, version
 * 1 (ADR 0007). Every command is plain JSON, and its inverse is a command
 * too, so commands can be stored, synced and undone.
 *
 * @public
 */
export type LearnCommand =
  | AddExerciseCommand
  | RemoveExerciseCommand
  | MoveExerciseCommand
  | SetExerciseTextCommand
  | SetPayloadCommand;

/**
 * The name of learn-sdk's command format (ADR 0007).
 *
 * @public
 */
export const COMMANDS_FORMAT = "hm-learn-commands";
