import { type LearnCommandRejection, LearnError } from "../errors/learn-error.js";
import { type LearnLimitOverrides, learnLimits } from "../errors/learn-limits.js";
import type {
  ContentDraft,
  LearnCommand,
  MoveExerciseCommand,
  SetExerciseTextCommand,
} from "../model/commands.js";
import type { Exercise } from "../model/content.js";
import type { ExerciseTypes } from "../model/exercise-type.js";
import { codePoints } from "../model/validation.js";

/**
 * Settings for {@link applyLearnCommand}.
 *
 * @public
 */
export interface ApplyLearnCommandOptions {
  /** The exercise types an added exercise may have. */
  readonly types: ExerciseTypes;
  readonly limits?: LearnLimitOverrides;
}

/**
 * A command applied: the new draft, the command as it was read, and the
 * command that undoes it.
 *
 * @public
 */
export interface AppliedLearnCommand {
  readonly state: ContentDraft;
  readonly command: LearnCommand;
  readonly inverse: LearnCommand;
}

const FIELDS: Readonly<
  Record<LearnCommand["type"], readonly [required: string[], optional: string[]]>
> = {
  "learn.addExercise": [["exercise", "at"], []],
  "learn.removeExercise": [["exerciseId"], []],
  "learn.moveExercise": [["exerciseId", "to"], []],
  "learn.setExerciseText": [["exerciseId", "field", "value"], []],
  "learn.setPayload": [["exerciseId", "payload"], []],
};
const EXERCISE_FIELDS: readonly [string[], string[]] = [
  ["id", "type", "payload"],
  ["title", "instructions"],
];
/** Deeper JSON than any payload needs, refused rather than walked. */
const MAX_DEPTH = 64;

type Reader = {
  readonly fail: (reason: LearnCommandRejection) => never;
  readonly maxText: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

function fields(
  value: unknown,
  [required, optional]: readonly [string[], string[]],
  reader: Reader,
  skip: string[] = [],
) {
  if (!isRecord(value)) {
    return reader.fail("malformed-command");
  }
  const known = new Set([...required, ...optional, ...skip]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !known.has(key)) {
      reader.fail("malformed-command");
    }
  }
  for (const name of required) {
    if (!Object.hasOwn(value, name)) {
      reader.fail("malformed-command");
    }
  }
  return value;
}

function text(value: unknown, reader: Reader, { blank = false } = {}): string {
  if (typeof value !== "string" || (!blank && value.trim() === "")) {
    return reader.fail("malformed-command");
  }
  if (codePoints(value) > reader.maxText) {
    reader.fail("text-too-long");
  }
  return value;
}

function whole(value: unknown, reader: Reader): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return reader.fail("malformed-command");
  }
  return value;
}

/** Checks that a value is JSON, with every text and key within the length limit. */
function json(value: unknown, reader: Reader, depth = 0): void {
  if (depth > MAX_DEPTH) {
    reader.fail("malformed-command");
  }
  if (value === null || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) reader.fail("malformed-command");
    return;
  }
  if (typeof value === "string") {
    text(value, reader, { blank: true });
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) reader.fail("malformed-command");
      json(value[index], reader, depth + 1);
    }
    return;
  }
  if (!isRecord(value)) {
    reader.fail("malformed-command");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") reader.fail("malformed-command");
    text(key, reader, { blank: true });
    json(value[key as string], reader, depth + 1);
  }
}

function payload(value: unknown, reader: Reader): object {
  if (!isRecord(value)) {
    return reader.fail("malformed-command");
  }
  json(value, reader);
  return value;
}

/** An exercise with its fields in the format's order, and without absent ones. */
const exerciseOf = ({ id, type, title, instructions, payload }: Exercise): Exercise => ({
  id,
  type,
  ...(title === undefined ? {} : { title }),
  ...(instructions === undefined ? {} : { instructions }),
  payload,
});

function readExercise(value: unknown, reader: Reader): Exercise {
  const read = fields(value, EXERCISE_FIELDS, reader);
  return exerciseOf({
    id: text(read["id"], reader),
    type: text(read["type"], reader),
    ...(read["title"] === undefined ? {} : { title: text(read["title"], reader) }),
    ...(read["instructions"] === undefined
      ? {}
      : { instructions: text(read["instructions"], reader) }),
    payload: payload(read["payload"], reader),
  });
}

/**
 * Reads a command as untrusted input: copied, then checked by shape, with
 * every text measured in code points.
 */
function readCommand(input: unknown, maxText: number): LearnCommand {
  let commandType: string | undefined;
  const reader: Reader = {
    maxText,
    fail(reason) {
      throw new LearnError("INVALID_COMMAND", "The command was refused.", {
        details: { reason, ...(commandType === undefined ? {} : { command: commandType }) },
      });
    },
  };
  let copy: unknown;
  try {
    copy = structuredClone(input);
  } catch {
    return reader.fail("malformed-command");
  }
  if (!isRecord(copy) || !Object.hasOwn(copy, "type") || typeof copy["type"] !== "string") {
    return reader.fail("malformed-command");
  }
  const type = copy["type"];
  if (!Object.hasOwn(FIELDS, type)) {
    return reader.fail("unknown-command");
  }
  commandType = type;
  const read = fields(copy, FIELDS[type as LearnCommand["type"]], reader, ["type"]);
  switch (type as LearnCommand["type"]) {
    case "learn.addExercise":
      return {
        type: "learn.addExercise",
        exercise: readExercise(read["exercise"], reader),
        at: whole(read["at"], reader),
      };
    case "learn.removeExercise":
      return { type: "learn.removeExercise", exerciseId: text(read["exerciseId"], reader) };
    case "learn.moveExercise":
      return {
        type: "learn.moveExercise",
        exerciseId: text(read["exerciseId"], reader),
        to: whole(read["to"], reader),
      };
    case "learn.setExerciseText": {
      const exerciseId = text(read["exerciseId"], reader);
      const field = read["field"];
      if (field !== "title" && field !== "instructions") {
        return reader.fail("malformed-command");
      }
      const value = read["value"] === null ? null : text(read["value"], reader);
      return { type: "learn.setExerciseText", exerciseId, field, value };
    }
    case "learn.setPayload":
      return {
        type: "learn.setPayload",
        exerciseId: text(read["exerciseId"], reader),
        payload: payload(read["payload"], reader),
      };
  }
}

/**
 * Applies an `hm-learn-command` command to a draft (ADR 0007), and returns
 * the new draft with the command that undoes it. It's the editor's reducer,
 * and a server applying commands it has stored or synced uses it the same
 * way.
 *
 * Commands are untrusted: each is copied with `structuredClone` and checked
 * by shape, and every text in it, including texts and keys inside a payload,
 * against `maxTextLength`, counted in code points. Exercise ids are compared
 * as values, never used as object keys. Nothing is corrected: a position out
 * of range or an unknown id is refused.
 *
 * @throws `LearnError` with `INVALID_COMMAND` and a
 *   {@link LearnCommandRejection} as `details.reason`.
 * @public
 */
export function applyLearnCommand(
  draft: ContentDraft,
  command: unknown,
  options: ApplyLearnCommandOptions,
): AppliedLearnCommand {
  const { limits } = learnLimits.resolve(options.limits);
  const read = readCommand(command, limits.maxTextLength.maximum);
  const refuse = (reason: LearnCommandRejection): never => {
    throw new LearnError("INVALID_COMMAND", "The command was refused.", {
      details: { reason, command: read.type },
    });
  };
  const exercises = draft.exercises;
  const indexOf = (id: string) => {
    const index = exercises.findIndex((exercise) => exercise.id === id);
    return index === -1 ? refuse("unknown-exercise") : index;
  };
  const withExercises = (list: readonly Exercise[]): ContentDraft => ({
    ...draft,
    exercises: list,
  });
  const replaced = (index: number, exercise: Exercise) =>
    withExercises(exercises.map((current, i) => (i === index ? exercise : current)));

  switch (read.type) {
    case "learn.addExercise": {
      const { exercise, at } = read;
      if (exercises.some((current) => current.id === exercise.id)) refuse("duplicate-id");
      if (!options.types.has(exercise.type)) refuse("unknown-type");
      if (exercises.length + 1 > limits.maxExercises.maximum) refuse("too-many-exercises");
      if (at > exercises.length) refuse("position-out-of-range");
      return {
        state: withExercises([...exercises.slice(0, at), exercise, ...exercises.slice(at)]),
        command: read,
        inverse: { type: "learn.removeExercise", exerciseId: exercise.id },
      };
    }
    case "learn.removeExercise": {
      const index = indexOf(read.exerciseId);
      return {
        state: withExercises(exercises.filter((_, i) => i !== index)),
        command: read,
        inverse: { type: "learn.addExercise", exercise: exercises[index] as Exercise, at: index },
      };
    }
    case "learn.moveExercise": {
      const index = indexOf(read.exerciseId);
      if (read.to >= exercises.length) refuse("position-out-of-range");
      const rest = exercises.filter((_, i) => i !== index);
      const inverse: MoveExerciseCommand = {
        type: "learn.moveExercise",
        exerciseId: read.exerciseId,
        to: index,
      };
      return {
        state: withExercises([
          ...rest.slice(0, read.to),
          exercises[index] as Exercise,
          ...rest.slice(read.to),
        ]),
        command: read,
        inverse,
      };
    }
    case "learn.setExerciseText": {
      const index = indexOf(read.exerciseId);
      const current = exercises[index] as Exercise;
      const inverse: SetExerciseTextCommand = { ...read, value: current[read.field] ?? null };
      const { [read.field]: _, ...rest } = current;
      const next = exerciseOf(
        read.value === null
          ? (rest as Exercise)
          : ({ ...rest, [read.field]: read.value } as Exercise),
      );
      return { state: replaced(index, next), command: read, inverse };
    }
    case "learn.setPayload": {
      const index = indexOf(read.exerciseId);
      const current = exercises[index] as Exercise;
      return {
        state: replaced(index, exerciseOf({ ...current, payload: read.payload })),
        command: read,
        inverse: {
          type: "learn.setPayload",
          exerciseId: read.exerciseId,
          payload: current.payload as object,
        },
      };
    }
  }
}
