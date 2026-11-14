import { type LearnLimitOverrides, learnLimits } from "../errors/learn-limits.js";
import { checkFormat, parseDocumentText, throwInvalidDocument } from "./documents.js";
import {
  type AttemptRecord,
  type CardRecord,
  PROGRESS_FORMAT,
  PROGRESS_VERSION,
  type ProgressSnapshot,
} from "./progress.js";
import { createIssueSink, createValidationContext } from "./validation.js";
import type { ValidationContext } from "./validation-context.js";

/**
 * Options for {@link parseProgress}.
 *
 * @public
 */
export interface ParseProgressOptions {
  /** The host's limit settings: `maxContentSize` bounds a document given as text, `maxTextLength` its ids. */
  readonly limits?: LearnLimitOverrides;
}

/**
 * Whether a value can stand as opaque JSON data: present, and not a function,
 * symbol or bigint. Opaque values are never walked (ADR 0006): their own
 * owners validate them.
 */
const isOpaqueJson = (value: unknown): boolean =>
  value !== undefined &&
  typeof value !== "function" &&
  typeof value !== "symbol" &&
  typeof value !== "bigint";

/** Reads a list's entries as own data, without a count limit: a document's size bounds it. */
function entries(value: unknown, context: ValidationContext): readonly unknown[] | undefined {
  if (value === undefined) {
    context.issue("required");
    return undefined;
  }
  if (!Array.isArray(value)) {
    context.issue("expected-list");
    return undefined;
  }
  const length = Object.getOwnPropertyDescriptor(value, "length");
  const count = length && "value" in length ? length.value : undefined;
  if (typeof count !== "number" || !Number.isSafeInteger(count)) {
    context.issue("not-data");
    return undefined;
  }
  const read: unknown[] = [];
  for (let index = 0; index < count; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor && !("value" in descriptor)) {
      context.at(index).issue("not-data");
    }
    read.push(descriptor && "value" in descriptor ? descriptor.value : undefined);
  }
  return read;
}

/** A positive whole number of milliseconds since the Unix epoch. */
function time(value: unknown, context: ValidationContext): number | undefined {
  const read = context.wholeNumber(value);
  if (read === 0) {
    context.issue("out-of-range");
    return undefined;
  }
  return read;
}

function opaque(
  fields: Partial<Record<string, unknown>>,
  name: string,
  context: ValidationContext,
): unknown {
  if (!Object.hasOwn(fields, name)) {
    context.at(name).issue("required");
    return undefined;
  }
  const value = fields[name];
  if (!isOpaqueJson(value)) {
    context.at(name).issue("not-data");
  }
  return value;
}

function readAttempt(entry: unknown, context: ValidationContext): AttemptRecord | undefined {
  const fields = context.fields(entry, ["exerciseId", "answer", "grade", "at"]);
  if (!fields) {
    return undefined;
  }
  const exerciseId = context.at("exerciseId").text(fields.exerciseId);
  const answer = opaque(fields, "answer", context);
  const gradeContext = context.at("grade");
  const gradeFields = gradeContext.fields(fields.grade, ["score", "max", "items"]);
  const score = gradeFields && gradeContext.at("score").wholeNumber(gradeFields.score);
  const max = gradeFields && gradeContext.at("max").wholeNumber(gradeFields.max);
  const itemList =
    gradeFields && gradeContext.at("items").list(gradeFields.items, { limit: "maxItems" });
  const items = itemList?.map((item, index) => gradeContext.at("items", index).yesNo(item));
  if (typeof score === "number" && typeof max === "number" && score > max) {
    gradeContext.at("score").issue("out-of-range");
  }
  const at = time(fields.at, context.at("at"));
  if (
    exerciseId === undefined ||
    !isOpaqueJson(answer) ||
    typeof score !== "number" ||
    typeof max !== "number" ||
    score > max ||
    !items ||
    items.some((item) => item === undefined) ||
    at === undefined
  ) {
    return undefined;
  }
  return { exerciseId, answer, grade: { score, max, items: items as boolean[] }, at };
}

function readCard(entry: unknown, context: ValidationContext): CardRecord | undefined {
  const fields = context.fields(entry, ["itemId", "scheduling", "due"]);
  if (!fields) {
    return undefined;
  }
  const itemId = context.at("itemId").text(fields.itemId);
  const schedulingContext = context.at("scheduling");
  const scheduling = schedulingContext.fields(fields.scheduling, [
    "scheduler",
    "model",
    "version",
    "card",
  ]);
  const scheduler = scheduling && schedulingContext.at("scheduler").text(scheduling.scheduler);
  const model = scheduling && schedulingContext.at("model").text(scheduling.model);
  const version = scheduling && schedulingContext.at("version").wholeNumber(scheduling.version);
  const card = scheduling && opaque(scheduling, "card", schedulingContext);
  const due = time(fields.due, context.at("due"));
  if (
    itemId === undefined ||
    typeof scheduler !== "string" ||
    typeof model !== "string" ||
    typeof version !== "number" ||
    !isOpaqueJson(card) ||
    due === undefined
  ) {
    return undefined;
  }
  return { itemId, scheduling: { scheduler, model, version, card }, due };
}

/**
 * Reads an `hm-learn-progress` document (ADR 0006), as text or an
 * already-parsed value, under the same rules as content (ADR 0002): size
 * first, then shape, own data properties only, unknown fields refused.
 *
 * Answers and scheduler states are opaque: they're only required to be
 * present JSON values, never walked or reshaped, and they're carried as
 * they are, keys such as `__proto__` included, as plain data.
 *
 * @param input - A JSON string, or a value already parsed.
 * @param options - Limits.
 * @returns The snapshot, with attempts and cards in document order.
 * @throws `LearnError`: `UNSUPPORTED_FORMAT` (`unknown-format`,
 *   `unknown-format-version`); `INVALID_DOCUMENT` (`not-json`, or
 *   `malformed-document` with `details.issues`); and the limits' codes.
 * @public
 */
export function parseProgress(
  input: unknown,
  options: ParseProgressOptions = {},
): ProgressSnapshot {
  const policy = learnLimits.resolve(options.limits);
  const sink = createIssueSink();
  const root = createValidationContext(policy, sink);
  const value = parseDocumentText(input, policy);
  const fields = root.fields(value, ["format", "version", "attempts", "cards"]);
  if (!fields) {
    throwInvalidDocument(sink);
  }
  checkFormat(fields, PROGRESS_FORMAT, [PROGRESS_VERSION]);
  if (fields.version === undefined) {
    root.at("version").issue("required");
  }
  const attempts = (entries(fields.attempts, root.at("attempts")) ?? []).map((entry, index) =>
    readAttempt(entry, root.at("attempts", index)),
  );
  const cards = (entries(fields.cards, root.at("cards")) ?? []).map((entry, index) =>
    readCard(entry, root.at("cards", index)),
  );
  if (sink.count > 0) {
    throwInvalidDocument(sink);
  }
  return { attempts: attempts as AttemptRecord[], cards: cards as CardRecord[] };
}
