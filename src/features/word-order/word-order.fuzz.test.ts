import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isLearnError } from "../../core/errors/learn-error.js";
import type { Exercise } from "../../core/model/content.js";
import { createExerciseTypes } from "../../core/model/exercise-type.js";
import { gradeAnswer } from "../../core/operations/grade-answer.js";
import { parseContent } from "../../core/operations/parse-content.js";
import { wordOrder } from "./word-order.js";

const types = createExerciseTypes([wordOrder]);
const asContent = (payload: unknown) => ({
  version: 1,
  exercises: [{ id: "w", type: "word-order", payload }],
});

function onlyLearnErrors<T>(run: () => T): T | undefined {
  try {
    return run();
  } catch (error) {
    if (!isLearnError(error)) {
      throw error;
    }
    return undefined;
  }
}

// Small alphabets make repeated tiles common, the case that matters most.
const tiles = fc.array(fc.constantFrom("ฉัน", "กิน", "ข้าว", "very", "good", "a"), {
  minLength: 2,
  maxLength: 8,
});

describe("word order, under arbitrary input", () => {
  it("validates any value without throwing anything but a LearnError", () => {
    fc.assert(
      fc.property(fc.anything({ withNullPrototype: true }), (value) => {
        onlyLearnErrors(() => parseContent(asContent(value), { types }));
        onlyLearnErrors(() => parseContent(asContent({ items: [value] }), { types }));
        onlyLearnErrors(() =>
          parseContent(asContent({ items: [{ tiles: ["a", "b"], alternatives: value }] }), {
            types,
          }),
        );
      }),
      { numRuns: 500 },
    );
  });

  it("grades any answer consistently, or refuses it with a LearnError", () => {
    fc.assert(
      fc.property(
        fc.array(tiles, { minLength: 1, maxLength: 5 }),
        fc.anything(),
        (itemTiles, answer) => {
          const exercise = parseContent(
            asContent({ items: itemTiles.map((t) => ({ tiles: t })) }),
            { types },
          ).exercises[0] as Exercise;
          for (const candidate of [answer, { orders: answer }]) {
            const grade = onlyLearnErrors(() => gradeAnswer(exercise, candidate, { types }));
            if (grade) {
              expect(grade.max).toBe(itemTiles.length);
              expect(grade.score).toBe(grade.items.filter(Boolean).length);
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("is right exactly when the placed texts equal the right order", () => {
    fc.assert(
      fc.property(
        tiles.chain((t) =>
          fc.tuple(fc.constant(t), fc.shuffledSubarray([...t.keys()], { minLength: t.length })),
        ),
        ([t, order]) => {
          const exercise = parseContent(asContent({ items: [{ tiles: t }] }), { types })
            .exercises[0] as Exercise;
          const grade = gradeAnswer(exercise, { orders: [order] }, { types });
          const placed = order.map((position) => t[position]);
          expect(grade.items[0]).toBe(placed.every((text, i) => text === t[i]));
        },
      ),
      { numRuns: 500 },
    );
  });
});
