import fc from "fast-check";
import { exercise, json, optional, text } from "./documents.js";

/**
 * Generators of hm-learn-commands commands, mostly valid and often not,
 * against a draft whose exercises are "mc", "gf" and "wo", as the
 * conformance generator's base content has them.
 */

const id = fc.constantFrom("mc", "gf", "wo", "new", "__proto__", "toString", " ");
const position = fc.oneof(fc.nat(4), fc.constantFrom(-1, 1.5));

export const command = fc
  .oneof(
    fc.record({
      type: fc.constant("learn.addExercise"),
      exercise: fc
        .tuple(id, optional(text), exercise)
        .map(([exerciseId, title, entry]) => ({ id: exerciseId, title, ...entry })),
      at: position,
    }),
    fc.record({ type: fc.constant("learn.removeExercise"), exerciseId: id }),
    fc.record({ type: fc.constant("learn.moveExercise"), exerciseId: id, to: position }),
    fc.record({
      type: fc.constant("learn.setExerciseText"),
      exerciseId: id,
      field: fc.constantFrom("title", "instructions", "id"),
      value: fc.option(text, { nil: null }),
    }),
    fc.record({
      type: fc.constant("learn.setPayload"),
      exerciseId: id,
      payload: fc.oneof(
        exercise.map((entry) => entry.payload),
        fc.jsonValue({ maxDepth: 2 }),
      ),
    }),
  )
  .map((value) => json(value));
