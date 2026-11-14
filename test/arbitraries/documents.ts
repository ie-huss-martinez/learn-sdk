import fc from "fast-check";

/**
 * Generators of hm-learn-content and hm-learn-progress documents, mostly
 * valid and often not, for the schema agreement properties and the
 * generated conformance cases. Exercises of type "free-form" are a host's:
 * test/conformance/run.ts registers that type.
 */

/** Short texts, often blank in one of the ways `trim` and the schema's pattern both know. */
export const text = fc.string({
  unit: fc.constantFrom("a", "ก", "😀", "_", " ", "\n", " ", "　", " ", "﻿"),
  maxLength: 5,
});
export const texts = (minLength: number, maxLength: number) =>
  fc.array(text, { minLength, maxLength });
export const optional = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: undefined });

/** Drops the fields an arbitrary left undefined, as JSON would. */
export const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const exercise = fc.oneof(
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
  fc.record({ type: fc.constant("free-form"), payload: fc.jsonValue({ maxDepth: 2 }) }),
);

export const content = fc
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

export const time = fc.oneof(
  fc.integer({ min: 0, max: 3 }),
  fc.integer({ min: 4, max: 2_000_000_000_000 }),
);
export const progress = fc
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

export const FIELD_NAMES = [
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
export const mutated = (documents: fc.Arbitrary<unknown>) =>
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
