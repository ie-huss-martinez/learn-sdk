import { schemaValidator } from "@hussmartinez/sdk-config/testing/conformance";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createExerciseTypes,
  defineExerciseType,
  gapFill,
  multipleChoice,
  parseContent,
  parseProgress,
  wordOrder,
} from "../src/index.js";

/**
 * The format schemas (learn-sdk ADR 0006, sdk-core ADR 0045, section 6)
 * agree with the hand-written readers: a reader never accepts a document its
 * schema refuses. A reader may refuse more, for what a schema can't express,
 * such as a duplicate id or a choice out of range.
 */

const contentErrors = schemaValidator(
  new URL("../formats/hm-learn-content/v1.schema.json", import.meta.url),
);
const progressErrors = schemaValidator(
  new URL("../formats/hm-learn-progress/v1.schema.json", import.meta.url),
);

/** A host's type that takes any object, so its exercises reach the payload rule. */
const note = defineExerciseType<object, unknown>({
  type: "note",
  validate: (payload) => payload as object,
  validateAnswer: (answer) => answer,
  grade: () => ({ score: 0, max: 0, items: [] }),
});
const types = createExerciseTypes([multipleChoice, gapFill, wordOrder, note]);

const accepts = (read: () => unknown) => {
  try {
    read();
    return true;
  } catch {
    return false;
  }
};

/** Short texts, often blank in one of the ways `trim` and the schema's pattern both know. */
const text = fc.string({
  unit: fc.constantFrom("a", "ก", "😀", "_", " ", "\n", " ", "　", " ", "﻿"),
  maxLength: 5,
});
const texts = (minLength: number, maxLength: number) => fc.array(text, { minLength, maxLength });
const optional = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: undefined });

/** Drops the fields an arbitrary left undefined, as JSON would. */
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const exercise = fc.oneof(
  fc.record({
    type: fc.constant("multiple-choice"),
    payload: fc.record({
      questions: fc.array(
        fc.record({
          prompt: text,
          choices: texts(1, 3),
          correct: fc.nat(3),
          explanation: optional(text),
        }),
        { minLength: 0, maxLength: 2 },
      ),
    }),
  }),
  fc.record({
    type: fc.constant("gap-fill"),
    payload: fc.record({
      items: fc.array(
        fc.record({
          sentence: fc.oneof(
            text,
            fc.tuple(text, text).map(([before, after]) => `${before}___${after}`),
          ),
          answers: texts(0, 2),
          options: optional(texts(1, 3)),
          translation: optional(text),
        }),
        { maxLength: 2 },
      ),
    }),
  }),
  fc.record({
    type: fc.constant("word-order"),
    payload: fc.record({
      items: fc.array(
        fc.record({
          tiles: texts(1, 3),
          alternatives: optional(fc.array(texts(0, 3), { maxLength: 2 })),
          translation: optional(text),
        }),
        { maxLength: 2 },
      ),
    }),
  }),
  fc.record({ type: fc.constant("note"), payload: fc.jsonValue({ maxDepth: 2 }) }),
);

const content = fc
  .array(
    fc
      .tuple(fc.constantFrom("a", "b", "c", " "), optional(text), exercise)
      .map(([id, title, entry]) => ({
        id,
        title,
        ...entry,
      })),
    { maxLength: 3 },
  )
  .map((exercises) => json({ format: "hm-learn-content", version: 1, exercises }));

const time = fc.oneof(
  fc.integer({ min: 0, max: 3 }),
  fc.integer({ min: 4, max: 2_000_000_000_000 }),
);
const progress = fc
  .record({
    attempts: fc.array(
      fc.record({
        exerciseId: text,
        answer: fc.jsonValue({ maxDepth: 2 }),
        grade: fc.record({
          score: fc.nat(3),
          max: fc.nat(3),
          items: fc.array(fc.boolean(), { maxLength: 3 }),
        }),
        at: time,
      }),
      { maxLength: 2 },
    ),
    cards: fc.array(
      fc.record({
        itemId: text,
        scheduling: fc.record({
          scheduler: text,
          model: text,
          version: fc.nat(2),
          card: fc.jsonValue({ maxDepth: 2 }),
        }),
        due: time,
      }),
      { maxLength: 2 },
    ),
  })
  .map((fields) => json({ format: "hm-learn-progress", version: 1, ...fields }));

const FIELD_NAMES = [
  "__proto__",
  "constructor",
  "toString",
  "format",
  "version",
  "id",
  "type",
  "payload",
  "extra",
];

/**
 * A document with one field anywhere in it replaced by any JSON value, or
 * one added: as an own property, as `JSON.parse` makes even for `__proto__`.
 */
const mutated = (documents: fc.Arbitrary<unknown>) =>
  fc
    .tuple(
      documents,
      fc.nat(),
      fc.nat(),
      fc.constantFrom(...FIELD_NAMES),
      fc.jsonValue({ maxDepth: 2 }),
      fc.boolean(),
    )
    .map(([document, which, index, name, replacement, add]) => {
      const nodes: object[] = [];
      const walk = (value: unknown) => {
        if (typeof value === "object" && value !== null) {
          nodes.push(value);
          Object.values(value).forEach(walk);
        }
      };
      walk(document);
      const node = nodes[which % nodes.length] as Record<string, unknown>;
      const keys = Object.keys(node);
      const key =
        Array.isArray(node) || (!add && keys.length > 0)
          ? (keys[index % keys.length] ?? "0")
          : name;
      Object.defineProperty(node, key, {
        value: replacement,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      return document;
    });

describe("the format schemas agree with the readers", () => {
  it("never let parseContent accept a document hm-learn-content's schema refuses", () => {
    fc.assert(
      fc.property(fc.oneof(content, mutated(content)), (document) => {
        if (accepts(() => parseContent(document, { types }))) {
          expect(contentErrors(document)).toEqual([]);
        }
      }),
      { numRuns: 3_000 },
    );
  });

  it("never let parseProgress accept a document hm-learn-progress's schema refuses", () => {
    fc.assert(
      fc.property(fc.oneof(progress, mutated(progress)), (document) => {
        if (accepts(() => parseProgress(document))) {
          expect(progressErrors(document)).toEqual([]);
        }
      }),
      { numRuns: 3_000 },
    );
  });

  it("generate documents the readers accept often enough to mean something", () => {
    const share = (documents: unknown[], read: (document: unknown) => unknown) =>
      documents.filter((document) => accepts(() => read(document))).length / documents.length;
    expect(
      share(fc.sample(content, { numRuns: 500, seed: 1 }), (document) =>
        parseContent(document, { types }),
      ),
    ).toBeGreaterThan(0.05);
    expect(share(fc.sample(progress, { numRuns: 500, seed: 1 }), parseProgress)).toBeGreaterThan(
      0.05,
    );
  });

  it("count text lengths in code points, as the schema's maxLength does", () => {
    const withTitle = (title: string) => ({
      format: "hm-learn-content",
      version: 1,
      exercises: [{ id: "a", type: "note", title, payload: {} }],
    });
    const fits = withTitle("😀".repeat(2_000));
    const over = withTitle("😀".repeat(2_001));
    expect([accepts(() => parseContent(fits, { types })), contentErrors(fits)]).toEqual([true, []]);
    expect(accepts(() => parseContent(over, { types }))).toBe(false);
    expect(contentErrors(over)).not.toEqual([]);
  });
});
