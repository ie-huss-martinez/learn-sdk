import { LearnError } from "../errors/learn-error.js";
import {
  type LearnLimitOverrides,
  type LearnLimitPolicy,
  learnLimits,
} from "../errors/learn-limits.js";
import { CONTENT_VERSION, type Content, type Exercise } from "../model/content.js";
import type { ExerciseTypes } from "../model/exercise-type.js";
import {
  createIssueSink,
  createValidationContext,
  type IssueSink,
  issueDetails,
} from "./validation.js";

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

/** UTF-8 size of a string, stopping as soon as it passes `stopAbove`. */
function utf8Size(text: string, stopAbove: number): number {
  if (text.length > stopAbove) {
    return text.length; // every code unit is at least one byte
  }
  let size = 0;
  for (let index = 0; index < text.length && size <= stopAbove; index++) {
    const unit = text.charCodeAt(index);
    if (unit < 0x80) {
      size += 1;
    } else if (unit < 0x800) {
      size += 2;
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      size += 4; // a surrogate pair is one four-byte character
      index++;
    } else {
      size += 3;
    }
  }
  return size;
}

function throwIssues(sink: IssueSink): never {
  throw new LearnError(
    "INVALID_CONTENT",
    sink.count === 1 ? "Content has a problem." : `Content has ${sink.count} problems.`,
    { details: issueDetails(sink) },
  );
}

/**
 * Checks content and returns it validated, rebuilt from the fields it
 * checked (ADR 0002).
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
 *   `UNSUPPORTED_CONTENT_VERSION` for an unknown format version; and
 *   `INVALID_CONTENT`, whose `details.issues` lists up to 100 issues and
 *   `details.count` how many there are.
 * @public
 */
export function parseContent(input: unknown, options: ParseContentOptions): Content {
  const policy: LearnLimitPolicy = learnLimits.resolve(options.limits);
  const sink = createIssueSink();
  const root = createValidationContext(policy, sink);

  let value: unknown = input;
  if (typeof input === "string") {
    policy.check("maxContentSize", utf8Size(input, policy.limits.maxContentSize.maximum));
    try {
      value = JSON.parse(input);
    } catch {
      root.issue("not-json");
      throwIssues(sink);
    }
  }

  const fields = root.fields(value, ["version", "exercises"]);
  if (!fields) {
    throwIssues(sink);
  }
  const version = fields.version;
  if (version !== CONTENT_VERSION) {
    if (version === undefined) {
      root.at("version").issue("required");
      throwIssues(sink);
    }
    throw new LearnError(
      "UNSUPPORTED_CONTENT_VERSION",
      "This content's format version isn't supported.",
      {
        details: {
          ...(typeof version === "number" && Number.isFinite(version) ? { version } : {}),
          supported: [CONTENT_VERSION],
        },
      },
    );
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
    throwIssues(sink);
  }
  return { version: CONTENT_VERSION, exercises };
}
