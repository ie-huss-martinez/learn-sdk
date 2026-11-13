import type { ExerciseType } from "../../core/model/exercise-type.js";
import { defineExerciseType } from "../../core/model/exercise-type.js";
import { normalizeForGrading } from "../../core/model/language-profile.js";
import type { ValidationContext } from "../../core/model/validation-context.js";

/** A gap: three or more underscores. */
const GAP = /_{3,}/g;

/**
 * Splits a gap-fill sentence at its gap, written as three or more
 * underscores, for display: the text before it and the text after it, or
 * `undefined` if the sentence doesn't have exactly one gap.
 *
 * @example
 * ```ts
 * splitAtGap("ฉัน ___ ข้าว"); // ["ฉัน ", " ข้าว"]
 * splitAtGap("no gap"); // undefined
 * ```
 *
 * @public
 */
export function splitAtGap(sentence: string): readonly [before: string, after: string] | undefined {
  const parts = sentence.split(GAP);
  return parts.length === 2 ? [parts[0] ?? "", parts[1] ?? ""] : undefined;
}

/**
 * One gap-fill item: a sentence with one gap, the answers accepted for it,
 * optional choices to pick from instead of typing, and an optional
 * translation.
 *
 * @public
 */
export interface GapFillItem {
  /** A sentence with exactly one gap, written as three or more underscores, such as `"ฉัน ___ ข้าว"`. */
  readonly sentence: string;
  /** 1 to `maxChoices` answers, any of which is right. */
  readonly answers: readonly string[];
  /** 2 to `maxChoices` choices to pick from, at least one of them an accepted answer. Without them, the learner types. */
  readonly options?: readonly string[];
  readonly translation?: string;
}

/**
 * The data of a `gap-fill` exercise: one or more items.
 *
 * @public
 */
export interface GapFillPayload {
  readonly items: readonly GapFillItem[];
}

/**
 * A learner's answer to a `gap-fill` exercise: for each item, in order, the
 * text they typed or picked, or `null` if they left it empty, which counts as
 * wrong.
 *
 * @public
 */
export interface GapFillAnswer {
  readonly filled: readonly (string | null)[];
}

/** Compares choices as a learner sees them: NFC, ignoring surrounding spaces. */
const asSeen = (text: string) => text.normalize("NFC").trim();

function texts(
  list: readonly unknown[] | undefined,
  context: ValidationContext,
): string[] | undefined {
  const read = list?.map((entry, index) => context.at(index).text(entry));
  return read?.every((text) => text !== undefined) ? (read as string[]) : undefined;
}

function validateItem(entry: unknown, context: ValidationContext): GapFillItem | undefined {
  const fields = context.fields(entry, ["sentence", "answers", "options", "translation"]);
  if (!fields) {
    return undefined;
  }
  const sentence = context.at("sentence").text(fields.sentence);
  if (sentence !== undefined && !splitAtGap(sentence)) {
    context.at("sentence").issue("gap-count");
  }
  const answers = texts(
    context.at("answers").list(fields.answers, { limit: "maxChoices", minimum: 1 }),
    context.at("answers"),
  );
  const optionList = context
    .at("options")
    .list(fields.options, { limit: "maxChoices", minimum: 2, optional: true });
  const options = optionList === undefined ? undefined : texts(optionList, context.at("options"));
  if (options) {
    const seen = new Set<string>();
    options.forEach((option, index) => {
      if (seen.has(asSeen(option))) {
        context.at("options", index).issue("duplicate-choice");
      }
      seen.add(asSeen(option));
    });
    if (answers && !answers.some((answer) => seen.has(asSeen(answer)))) {
      context.at("options").issue("answer-not-in-options");
    }
  }
  const translation = context.at("translation").text(fields.translation, { optional: true });
  if (sentence === undefined || !answers || (optionList !== undefined && !options)) {
    return undefined;
  }
  return {
    sentence,
    answers,
    ...(options ? { options } : {}),
    ...(translation === undefined ? {} : { translation }),
  };
}

/**
 * The `gap-fill` exercise type: sentences with one gap each, filled by
 * typing or by picking from choices (ADR 0001). Typed and picked answers are
 * compared after NFC and the language profile's rules
 * ({@link normalizeForGrading}), so they grade the same everywhere.
 *
 * Its issues, beyond the generic ones: `gap-count` when a sentence doesn't
 * have exactly one gap, `duplicate-choice` for two choices that read the
 * same, and `answer-not-in-options` when the choices include no accepted
 * answer.
 *
 * @example
 * ```ts
 * const payload = {
 *   items: [{ sentence: "ฉัน ___ ข้าว", answers: ["กิน", "ทาน"], translation: "I eat rice." }],
 * };
 * gradeAnswer(exercise, { filled: ["ทาน"] }, { types, profile: thai }); // { score: 1, max: 1, items: [true] }
 * ```
 *
 * @public
 */
export const gapFill: ExerciseType<GapFillPayload, GapFillAnswer> =
  /* @__PURE__ */ defineExerciseType<GapFillPayload, GapFillAnswer>({
    type: "gap-fill",
    validate(payload, context) {
      const fields = context.fields(payload, ["items"]);
      const list =
        fields && context.at("items").list(fields.items, { limit: "maxItems", minimum: 1 });
      if (!list) {
        return undefined;
      }
      const items = list.map((entry, index) => validateItem(entry, context.at("items", index)));
      return items.length > 0 && items.every((item) => item !== undefined)
        ? { items: items as GapFillItem[] }
        : undefined;
    },
    validateAnswer(answer, payload, context) {
      const fields = context.fields(answer, ["filled"]);
      const list = fields && context.at("filled").list(fields.filled, { limit: "maxItems" });
      if (!list) {
        return undefined;
      }
      if (list.length !== payload.items.length) {
        context.at("filled").issue("out-of-range");
        return undefined;
      }
      const filled = list.map((entry, index) =>
        entry === null ? null : context.at("filled", index).text(entry, { allowEmpty: true }),
      );
      return filled.every((text) => text !== undefined)
        ? { filled: filled as (string | null)[] }
        : undefined;
    },
    grade(payload, answer, profile) {
      const items = payload.items.map((item, index) => {
        const given = answer.filled[index];
        if (given === null || given === undefined) {
          return false;
        }
        const normalized = normalizeForGrading(given, profile);
        return (
          normalized !== "" &&
          item.answers.some((accepted) => normalizeForGrading(accepted, profile) === normalized)
        );
      });
      return { score: items.filter(Boolean).length, max: items.length, items };
    },
  });
