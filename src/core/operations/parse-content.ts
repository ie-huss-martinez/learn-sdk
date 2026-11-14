import {
  type LearnLimitOverrides,
  type LearnLimitPolicy,
  learnLimits,
} from "../errors/learn-limits.js";
import { CONTENT_FORMAT, CONTENT_VERSION, type Content, type Exercise } from "../model/content.js";
import { checkFormat, parseDocumentText, throwInvalidDocument } from "../model/documents.js";
import type { ExerciseTypes } from "../model/exercise-type.js";
import { createIssueSink, createValidationContext } from "../model/validation.js";

/**
 * Options for {@link parseContent}.
 *
 * @public
 */
export interface ParseContentOptions {
  /** The exercise types content may use. */
  readonly types: ExerciseTypes;
  /** The host's limit settings; sdk-core's and the learn SDK's defaults otherwise. */
  readonly limits?: LearnLimitOverrides;
}

/**
 * Reads an `hm-learn-content` document (ADR 0006) and returns it validated,
 * rebuilt from the fields it checked (ADR 0002).
 *
 * 1. A string's UTF-8 size is checked against `maxContentSize` before
 *    anything else, then it's parsed with `JSON.parse`.
 * 2. The value, parsed or given, is read by shape: only the fields the
 *    format and each exercise's type define, own data properties only, so
 *    getters are never called and untrusted nesting is never followed.
 * 3. Counts and lengths are checked as they're read, and stop validation at
 *    once.
 *
 * Problems with the content's structure are collected as issues and thrown
 * together. The result shares no objects with the input.
 *
 * @param input - A JSON string, or a value the host has already parsed.
 * @param options - The exercise types and limits.
 * @throws `LearnError`: `CONTENT_TOO_LARGE` and the other limits' codes;
 *   `UNSUPPORTED_FORMAT` (`unknown-format`, `unknown-format-version`) for a
 *   document that isn't `hm-learn-content` version 1; and `INVALID_DOCUMENT`,
 *   with the reason `not-json`, or `malformed-document` and `details.issues`
 *   listing up to 100 issues, `details.count` saying how many there are.
 * @public
 */
export function parseContent(input: unknown, options: ParseContentOptions): Content {
  const policy: LearnLimitPolicy = learnLimits.resolve(options.limits);
  const sink = createIssueSink();
  const root = createValidationContext(policy, sink);

  const value = parseDocumentText(input, policy);
  const fields = root.fields(value, ["format", "version", "exercises"]);
  if (!fields) {
    throwInvalidDocument(sink);
  }
  checkFormat(fields, CONTENT_FORMAT, [CONTENT_VERSION]);
  if (fields.version === undefined) {
    root.at("version").issue("required");
    throwInvalidDocument(sink);
  }

  const list = root.at("exercises").list(fields.exercises, { limit: "maxExercises" }) ?? [];
  const ids = new Set<string>();
  const exercises: Exercise[] = [];
  list.forEach((entry, index) => {
    const context = root.at("exercises", index);
    const exercise = context.fields(entry, ["id", "type", "title", "instructions", "payload"]);
    if (!exercise) {
      return;
    }
    const id = context.at("id").text(exercise.id);
    if (id !== undefined) {
      if (ids.has(id)) {
        context.at("id").issue("duplicate-id");
      }
      ids.add(id);
    }
    const typeName = context.at("type").text(exercise.type);
    const title = context.at("title").text(exercise.title, { optional: true });
    const instructions = context.at("instructions").text(exercise.instructions, { optional: true });
    const type = typeName === undefined ? undefined : options.types.get(typeName);
    if (typeName !== undefined && !type) {
      context.at("type").issue("unknown-type");
    }
    let payload: unknown;
    if (exercise.payload === undefined) {
      context.at("payload").issue("required");
    } else if (!isObject(exercise.payload)) {
      // Every payload is an object, whatever its type (ADR 0006), so the
      // format's schema holds for a host's types as well as the built-in ones.
      context.at("payload").issue("expected-object");
    } else if (type) {
      payload = type.validate(exercise.payload, context.at("payload"));
    }
    if (id !== undefined && typeName !== undefined && payload !== undefined) {
      exercises.push({
        id,
        type: typeName,
        ...(title === undefined ? {} : { title }),
        ...(instructions === undefined ? {} : { instructions }),
        payload,
      });
    }
  });

  if (sink.count > 0) {
    throwInvalidDocument(sink);
  }
  return { format: CONTENT_FORMAT, version: CONTENT_VERSION, exercises };
}

const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);
