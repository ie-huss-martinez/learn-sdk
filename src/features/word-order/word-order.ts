import type { ExerciseType } from "../../core/model/exercise-type.js";
import { defineExerciseType } from "../../core/model/exercise-type.js";
import type { ValidationContext } from "../../core/model/validation-context.js";

/**
 * One word-order item: a sentence's tiles in the right order, other orders
 * that are also right, and an optional translation.
 *
 * Tiles are stored, never computed by splitting text, so every runtime grades
 * the same tiles (ADR 0001, ADR 0004).
 *
 * @public
 */
export interface WordOrderItem {
  /** 2 to `maxTiles` tiles, in the right order. The same text may appear more than once. */
  readonly tiles: readonly string[];
  /** Other right orders, each using every tile once, for languages with free word order. */
  readonly alternatives?: readonly (readonly string[])[];
  readonly translation?: string;
}

/**
 * The data of a `word-order` exercise: one or more items.
 *
 * @public
 */
export interface WordOrderPayload {
  readonly items: readonly WordOrderItem[];
}

/**
 * A learner's answer to a `word-order` exercise: for each item, in order, the
 * positions of its tiles (in `tiles`, from 0) in the order the learner put
 * them, using each once, or `null` if they left it unanswered, which counts
 * as wrong.
 *
 * @public
 */
export interface WordOrderAnswer {
  readonly orders: readonly (readonly number[] | null)[];
}

/** Whether `order` holds the same texts as `tiles`, each as many times. */
function isPermutation(order: readonly string[], tiles: readonly string[]): boolean {
  if (order.length !== tiles.length) {
    return false;
  }
  const counts = new Map<string, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  for (const text of order) {
    const left = counts.get(text) ?? 0;
    if (left === 0) {
      return false;
    }
    counts.set(text, left - 1);
  }
  return true;
}

function readTexts(
  list: readonly unknown[] | undefined,
  context: ValidationContext,
): string[] | undefined {
  const read = list?.map((entry, index) => context.at(index).text(entry));
  return read?.every((text) => text !== undefined) ? (read as string[]) : undefined;
}

function validateItem(entry: unknown, context: ValidationContext): WordOrderItem | undefined {
  const fields = context.fields(entry, ["tiles", "alternatives", "translation"]);
  if (!fields) {
    return undefined;
  }
  const tiles = readTexts(
    context.at("tiles").list(fields.tiles, { limit: "maxTiles", minimum: 2 }),
    context.at("tiles"),
  );
  const alternativeList = context
    .at("alternatives")
    .list(fields.alternatives, { limit: "maxChoices", optional: true });
  let alternatives: string[][] | undefined;
  let alternativesValid = fields.alternatives === undefined;
  if (alternativeList) {
    const read = alternativeList.map((alternative, index) => {
      const at = context.at("alternatives", index);
      const order = readTexts(at.list(alternative, { limit: "maxTiles" }), at);
      if (order && tiles && !isPermutation(order, tiles)) {
        at.issue("not-a-permutation");
        return undefined;
      }
      return order;
    });
    alternativesValid = read.every((order) => order !== undefined);
    alternatives = alternativesValid ? (read as string[][]) : undefined;
  }
  const translation = context.at("translation").text(fields.translation, { optional: true });
  if (!tiles || !alternativesValid) {
    return undefined;
  }
  return {
    tiles,
    ...(alternatives && alternatives.length > 0 ? { alternatives } : {}),
    ...(translation === undefined ? {} : { translation }),
  };
}

/**
 * The `word-order` exercise type: put a sentence's tiles in order (ADR 0001).
 * Answers are tile positions; an answer is right when the texts it puts in
 * order equal the right order or one of the alternatives, so swapping two
 * identical tiles never matters, and no text is ever segmented or normalised
 * while grading.
 *
 * Its issue, beyond the generic ones: `not-a-permutation`, for an
 * alternative or an answer that doesn't use every tile exactly once.
 *
 * @example
 * ```ts
 * const payload = {
 *   items: [{ tiles: ["ฉัน", "กิน", "ข้าว"], translation: "I eat rice." }],
 * };
 * gradeAnswer(exercise, { orders: [[0, 1, 2]] }, { types }); // { score: 1, max: 1, items: [true] }
 * ```
 *
 * @public
 */
export const wordOrder: ExerciseType<WordOrderPayload, WordOrderAnswer> =
  /* @__PURE__ */ defineExerciseType<WordOrderPayload, WordOrderAnswer>({
    type: "word-order",
    validate(payload, context) {
      const fields = context.fields(payload, ["items"]);
      const list =
        fields && context.at("items").list(fields.items, { limit: "maxItems", minimum: 1 });
      if (!list) {
        return undefined;
      }
      const items = list.map((entry, index) => validateItem(entry, context.at("items", index)));
      return items.length > 0 && items.every((item) => item !== undefined)
        ? { items: items as WordOrderItem[] }
        : undefined;
    },
    validateAnswer(answer, payload, context) {
      const fields = context.fields(answer, ["orders"]);
      const list = fields && context.at("orders").list(fields.orders, { limit: "maxItems" });
      if (!list) {
        return undefined;
      }
      if (list.length !== payload.items.length) {
        context.at("orders").issue("out-of-range");
        return undefined;
      }
      let valid = true;
      const orders = list.map((entry, index) => {
        if (entry === null) {
          return null;
        }
        const at = context.at("orders", index);
        const positions = at
          .list(entry, { limit: "maxTiles" })
          ?.map((position, i) => at.at(i).wholeNumber(position));
        const count = payload.items[index]?.tiles.length ?? 0;
        if (!positions || positions.some((position) => position === undefined)) {
          valid = false;
          return null;
        }
        const used = new Set(positions);
        if (
          positions.length !== count ||
          used.size !== count ||
          positions.some((position) => (position as number) >= count)
        ) {
          at.issue("not-a-permutation");
          valid = false;
          return null;
        }
        return positions as number[];
      });
      return valid ? { orders } : undefined;
    },
    grade(payload, answer) {
      const items = payload.items.map((item, index) => {
        const order = answer.orders[index];
        if (!order) {
          return false;
        }
        const placed = order.map((position) => item.tiles[position] ?? "");
        const same = (right: readonly string[]) =>
          right.length === placed.length && right.every((text, i) => text === placed[i]);
        return same(item.tiles) || (item.alternatives ?? []).some(same);
      });
      return { score: items.filter(Boolean).length, max: items.length, items };
    },
  });
