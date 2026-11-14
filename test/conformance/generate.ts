import type {
  ConformanceCase,
  ConformanceFile,
} from "@hussmartinez/sdk-config/testing/conformance";
import fc from "fast-check";
import { isLearnError, type SchedulingState } from "../../src/index.js";
import { content, mutated, progress } from "../arbitraries/documents.js";
import {
  access,
  applyChanges,
  grade,
  readContent,
  readProgress,
  type SchedulingInput,
  schedule,
} from "./run.js";

/**
 * Writes the conformance cases (sdk-core ADR 0045): hand-written cases for
 * every outcome a port must reproduce, and documents generated with a fixed
 * seed. Each hand-written case says the outcome it's meant to have, and
 * generating fails if the SDK disagrees, so a case can't silently test
 * something else. The files in conformance/ are this module's output,
 * checked in; `pnpm conformance:update` rewrites them, and the tests fail
 * when they're out of date.
 */

/** The seed of the generated cases. Changing it, or fast-check's version, rewrites them. */
const SEED = 45;
/** How many generated documents each format's file keeps, of those read and of those refused. */
const GENERATED_EACH = 15;
/** How many documents are generated to choose them from. */
const GENERATED_POOL = 1_000;
/** FSRS-7's states hold computed floats, compared within this (ADR 0045, section 3). */
const FSRS_TOLERANCE = 1e-9;

/** 2026-01-01T00:00:00Z, and a day, in milliseconds. */
const T = 1_767_225_600_000;
const DAY = 86_400_000;

/** Accepted, or refused with this code and, when the code has them, this reason. */
type Outcome = "accepted" | { readonly code: string; readonly reason?: string };
type HandWritten = readonly [name: string, input: unknown, outcome: Outcome, tolerance?: number];

const accepted: Outcome = "accepted";
const refused = (code: string, reason?: string): Outcome => (reason ? { code, reason } : { code });
const malformed = refused("INVALID_DOCUMENT", "malformed-document");
const malformedAnswer = refused("INVALID_ANSWER", "malformed-answer");

/** The value as JSON carries it: what a port reads from the file. */
const asJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * A value from JSON text. Keys such as `__proto__` must be written this way:
 * in an object literal, `__proto__` sets the prototype instead of a key.
 */
const fromText = (text: string): unknown => JSON.parse(text);

const file = (subject: string, description: string, cases: ConformanceCase[]): ConformanceFile => ({
  format: "hm-conformance",
  version: 1,
  subject,
  description,
  cases,
});

/** Runs each case, checks its intended outcome, and records what the SDK gives. */
function run<Input>(
  run: (input: Input) => unknown,
  cases: readonly HandWritten[],
): ConformanceCase[] {
  return cases.map(([name, rawInput, outcome, tolerance]) => {
    const input = asJson(rawInput);
    let expected: unknown;
    try {
      expected = asJson(run(input as Input));
    } catch (error) {
      if (!isLearnError(error)) {
        throw error;
      }
      const reason = error.details?.["reason"];
      expected = { error: { code: error.code, ...(typeof reason === "string" ? { reason } : {}) } };
    }
    const got: Outcome =
      typeof expected === "object" && expected !== null && "error" in expected
        ? (expected as { error: Outcome & object }).error
        : "accepted";
    if (JSON.stringify(got) !== JSON.stringify(outcome)) {
      throw new Error(`"${name}" gave ${JSON.stringify(got)}, not ${JSON.stringify(outcome)}.`);
    }
    return { name, input, expected, ...(tolerance === undefined ? {} : { tolerance }) };
  });
}

/**
 * Documents from the schema properties' generators: as many that a reader
 * accepts as it refuses, since most generated documents are refused.
 */
function generated(
  documents: fc.Arbitrary<unknown>,
  read: (input: { document: unknown }) => unknown,
) {
  const kept: { accepted: HandWritten[]; refused: HandWritten[] } = { accepted: [], refused: [] };
  for (const document of fc.sample(fc.oneof(documents, mutated(documents)), {
    numRuns: GENERATED_POOL,
    seed: SEED,
  })) {
    let outcome: Outcome = accepted;
    try {
      read({ document: asJson(document) });
    } catch (error) {
      if (!isLearnError(error)) {
        throw error;
      }
      const reason = error.details?.["reason"];
      outcome = refused(error.code, typeof reason === "string" ? reason : undefined);
    }
    const list = outcome === accepted ? kept.accepted : kept.refused;
    if (list.length < GENERATED_EACH) {
      list.push([
        `generated document ${outcome === accepted ? "read" : "refused"} ${list.length + 1}`,
        { document },
        outcome,
      ]);
    }
  }
  return [...kept.accepted, ...kept.refused];
}

// hm-learn-content

const mc = {
  id: "mc",
  type: "multiple-choice",
  title: "อาหาร",
  payload: {
    questions: [
      {
        prompt: "กิน",
        choices: ["eat", "drink", "sleep"],
        correct: 0,
        explanation: "กิน means to eat.",
      },
    ],
  },
};
const gf = {
  id: "gf",
  type: "gap-fill",
  payload: {
    items: [
      {
        sentence: "ฉัน ___ ข้าว",
        answers: ["กิน"],
        options: ["กิน", "ดื่ม"],
        translation: "I eat rice.",
      },
      { sentence: "Je _____ du pain.", answers: ["mange"] },
    ],
  },
};
const wo = {
  id: "wo",
  type: "word-order",
  instructions: "Put the words in order.",
  payload: {
    items: [{ tiles: ["Yesterday", "I", "ran"], alternatives: [["I", "ran", "Yesterday"]] }],
  },
};
const contentDocument = (...exercises: unknown[]) => ({
  format: "hm-learn-content",
  version: 1,
  exercises,
});
const BASE_CONTENT = contentDocument(mc, gf, wo);
const withQuestion = (changes: Record<string, unknown>) =>
  contentDocument({ ...mc, payload: { questions: [{ ...mc.payload.questions[0], ...changes }] } });
const withGap = (changes: Record<string, unknown>) =>
  contentDocument({ ...gf, payload: { items: [{ ...gf.payload.items[0], ...changes }] } });
const withTiles = (changes: Record<string, unknown>) =>
  contentDocument({ ...wo, payload: { items: [{ ...wo.payload.items[0], ...changes }] } });
const freeForm = (id: string, payload: unknown = {}) => ({ id, type: "free-form", payload });
const emoji = (count: number) => "😀".repeat(count);

export function contentCases(): ConformanceFile {
  const doc = (document: unknown, limits?: Record<string, number>) =>
    limits ? { document, limits } : { document };
  const cases: HandWritten[] = [
    ["reads one exercise of each built-in type", doc(BASE_CONTENT), accepted],
    ["reads a document with no exercises", doc(contentDocument()), accepted],
    ["reads a document from JSON text", doc(JSON.stringify(BASE_CONTENT)), accepted],
    [
      "reads a host type's payload unchanged",
      doc(contentDocument(freeForm("h", { level: 2, cards: [{ front: "กิน", back: null }] }))),
      accepted,
    ],
    [
      "keeps __proto__, constructor and toString in a host type's payload as data",
      doc(
        fromText(
          '{"format":"hm-learn-content","version":1,"exercises":[{"id":"h","type":"free-form","payload":{"__proto__":{"x":1},"constructor":"a","toString":5}}]}',
        ),
      ),
      accepted,
    ],
    [
      "reads exercise ids __proto__, constructor and toString",
      doc(contentDocument(freeForm("__proto__"), freeForm("constructor"), freeForm("toString"))),
      accepted,
    ],
    [
      "reads a text of 2,000 emoji: the limit counts code points",
      doc(contentDocument({ ...freeForm("h"), title: emoji(2_000) })),
      accepted,
    ],
    [
      "reads a text of 10 emoji, 20 UTF-16 units, under a limit of 10",
      doc(contentDocument({ ...freeForm("h"), title: emoji(10) }), { maxTextLength: 10 }),
      accepted,
    ],
    ["reads a gap of five underscores", doc(withGap({ sentence: "ฉัน _____ ข้าว" })), accepted],
    [
      "reads 8 choices",
      doc(withQuestion({ choices: ["1", "2", "3", "4", "5", "6", "7", "8"], correct: 7 })),
      accepted,
    ],
    ["reads texts with white space around them", doc(withQuestion({ prompt: "  กิน\n" })), accepted],

    ["refuses text that isn't JSON", doc('{"format":'), refused("INVALID_DOCUMENT", "not-json")],
    ["refuses JSON that isn't an object", doc("[]"), malformed],
    [
      "refuses a document without a format",
      doc({ version: 1, exercises: [] }),
      refused("UNSUPPORTED_FORMAT", "unknown-format"),
    ],
    [
      "refuses another format",
      doc({ ...BASE_CONTENT, format: "hm-learn-progress" }),
      refused("UNSUPPORTED_FORMAT", "unknown-format"),
    ],
    [
      "refuses a later version",
      doc({ ...BASE_CONTENT, version: 2 }),
      refused("UNSUPPORTED_FORMAT", "unknown-format-version"),
    ],
    [
      "refuses a version given as text",
      doc({ ...BASE_CONTENT, version: "1" }),
      refused("UNSUPPORTED_FORMAT", "unknown-format-version"),
    ],
    [
      "refuses a document without a version",
      doc({ format: "hm-learn-content", exercises: [] }),
      malformed,
    ],
    ["refuses an unknown field", doc({ ...BASE_CONTENT, extra: true }), malformed],
    [
      "refuses a __proto__ field in the document",
      doc(fromText('{"format":"hm-learn-content","version":1,"exercises":[],"__proto__":{}}')),
      malformed,
    ],
    [
      "refuses a constructor field in an exercise",
      doc(
        fromText(
          '{"format":"hm-learn-content","version":1,"exercises":[{"id":"h","type":"free-form","payload":{},"constructor":"x"}]}',
        ),
      ),
      malformed,
    ],
    [
      "refuses a toString field in a built-in payload's question",
      doc(
        fromText(
          '{"format":"hm-learn-content","version":1,"exercises":[{"id":"mc","type":"multiple-choice","payload":{"questions":[{"prompt":"p","choices":["a","b"],"correct":0,"toString":1}]}}]}',
        ),
      ),
      malformed,
    ],
    [
      "refuses a __proto__ field in a built-in payload",
      doc(
        fromText(
          '{"format":"hm-learn-content","version":1,"exercises":[{"id":"wo","type":"word-order","payload":{"items":[{"tiles":["a","b"]}],"__proto__":{}}}]}',
        ),
      ),
      malformed,
    ],
    [
      "refuses two exercises with the same id",
      doc(contentDocument(freeForm("a"), freeForm("a"))),
      malformed,
    ],
    [
      "refuses a type the host didn't register",
      doc(contentDocument({ id: "e", type: "essay", payload: {} })),
      malformed,
    ],
    [
      "refuses a host type's payload that isn't an object",
      doc(contentDocument(freeForm("h", ["a"]))),
      malformed,
    ],
    [
      "refuses an exercise without a payload",
      doc(contentDocument({ id: "h", type: "free-form" })),
      malformed,
    ],
    [
      "refuses a text of spaces",
      doc(contentDocument({ ...freeForm("h"), title: "   " })),
      malformed,
    ],
    [
      "refuses a text of ideographic spaces",
      doc(contentDocument({ ...freeForm("h"), title: "　　" })),
      malformed,
    ],
    ["refuses a text of a byte order mark", doc(contentDocument(freeForm("﻿"))), malformed],
    [
      "refuses an empty text",
      doc(contentDocument({ ...freeForm("h"), instructions: "" })),
      malformed,
    ],
    [
      "refuses a text of 2,001 emoji",
      doc(contentDocument({ ...freeForm("h"), title: emoji(2_001) })),
      refused("TEXT_TOO_LONG"),
    ],
    [
      "refuses a text of 11 emoji under a limit of 10",
      doc(contentDocument({ ...freeForm("h"), title: emoji(11) }), { maxTextLength: 10 }),
      refused("TEXT_TOO_LONG"),
    ],
    [
      "refuses 9 choices",
      doc(withQuestion({ choices: ["1", "2", "3", "4", "5", "6", "7", "8", "9"] })),
      refused("TOO_MANY_CHOICES"),
    ],
    [
      "refuses 3 exercises under a limit of 2",
      doc(BASE_CONTENT, { maxExercises: 2 }),
      refused("TOO_MANY_EXERCISES"),
    ],
    [
      "refuses 31 tiles",
      doc(withTiles({ tiles: Array.from({ length: 31 }, (_, i) => `w${i}`), alternatives: [] })),
      refused("TOO_MANY_TILES"),
    ],
    [
      "refuses text over the size limit, counted in UTF-8 bytes",
      // 60 Thai characters are 60 UTF-16 units but 180 UTF-8 bytes.
      doc(JSON.stringify(contentDocument({ ...freeForm("h"), title: "ก".repeat(60) })), {
        maxContentSize: 150,
      }),
      refused("CONTENT_TOO_LARGE"),
    ],
    [
      "refuses a question with one choice",
      doc(withQuestion({ choices: ["eat"], correct: 0 })),
      malformed,
    ],
    ["refuses a correct choice out of range", doc(withQuestion({ correct: 3 })), malformed],
    [
      "refuses a correct choice that isn't a whole number",
      doc(withQuestion({ correct: 0.5 })),
      malformed,
    ],
    ["refuses a negative correct choice", doc(withQuestion({ correct: -1 })), malformed],
    [
      "refuses choices the same once trimmed",
      doc(withQuestion({ choices: ["eat", " eat "] })),
      malformed,
    ],
    [
      "refuses choices the same after NFC",
      doc(withQuestion({ choices: ["café", "café"] })),
      malformed,
    ],
    ["refuses a sentence without a gap", doc(withGap({ sentence: "ฉัน __ ข้าว" })), malformed],
    ["refuses a sentence with two gaps", doc(withGap({ sentence: "___ กิน ___" })), malformed],
    [
      "refuses options without an accepted answer",
      doc(withGap({ options: ["ดื่ม", "นอน"] })),
      malformed,
    ],
    [
      "refuses an alternative that isn't a permutation of the tiles",
      doc(withTiles({ alternatives: [["I", "ran"]] })),
      malformed,
    ],
    ["refuses one tile", doc(withTiles({ tiles: ["ran"], alternatives: [] })), malformed],
    ...generated(content, readContent),
  ];
  return file(
    "hm-learn-content",
    'Reading hm-learn-content documents (docs/formats/hm-learn-content.md). input.document is the document, as a JSON value or as JSON text; input.limits, when given, overrides learn-sdk\'s default limits. expected is the content as the reader returns it, or the rejection. The host registers the built-in types and "free-form", whose payload is any object, returned unchanged.',
    run(readContent, cases),
  );
}

// hm-learn-progress

const attempt = {
  exerciseId: "mc",
  answer: { selected: [0] },
  grade: { score: 1, max: 1, items: [true] },
  at: T,
};
const card = {
  itemId: "กิน",
  scheduling: {
    scheduler: "fsrs",
    model: "FSRS-7",
    version: 1,
    card: { stability: 3.9, difficulty: 5.1 },
  },
  due: T + 3 * DAY,
};
const progressDocument = (attempts: unknown[] = [attempt], cards: unknown[] = [card]) => ({
  format: "hm-learn-progress",
  version: 1,
  attempts,
  cards,
});
const withAttempt = (changes: Record<string, unknown>) =>
  progressDocument([{ ...attempt, ...changes }]);
const withCard = (changes: Record<string, unknown>) =>
  progressDocument([], [{ ...card, ...changes }]);
const withScheduling = (changes: Record<string, unknown>) =>
  withCard({ scheduling: { ...card.scheduling, ...changes } });

export function progressCases(): ConformanceFile {
  const doc = (document: unknown, limits?: Record<string, number>) =>
    limits ? { document, limits } : { document };
  const cases: HandWritten[] = [
    ["reads a document unchanged", doc(progressDocument()), accepted],
    ["reads a document with no attempts or cards", doc(progressDocument([], [])), accepted],
    ["reads a document from JSON text", doc(JSON.stringify(progressDocument())), accepted],
    [
      "copies answers of every JSON kind unchanged",
      doc(
        progressDocument(
          [null, "กิน", 1.5, [1, "a", null], true, { deep: { list: [{}] } }].map((answer) => ({
            ...attempt,
            answer,
          })),
        ),
      ),
      accepted,
    ],
    [
      "copies a scheduler state's floats exactly",
      doc(withScheduling({ card: { stability: 0.30000000000000004, difficulty: 1e-7 } })),
      accepted,
    ],
    [
      "reads a state from a scheduler it doesn't know",
      doc(withScheduling({ scheduler: "my-own", model: "v9", version: 7, card: [1, 2] })),
      accepted,
    ],
    [
      "keeps __proto__, constructor and toString in an answer and a scheduler state as data",
      doc(
        fromText(
          `{"format":"hm-learn-progress","version":1,"attempts":[{"exerciseId":"e","answer":{"__proto__":{"x":1},"constructor":"a","toString":5},"grade":{"score":0,"max":1,"items":[false]},"at":${T}}],"cards":[{"itemId":"w","scheduling":{"scheduler":"s","model":"m","version":1,"card":{"__proto__":[],"constructor":{}}},"due":${T}}]}`,
        ),
      ),
      accepted,
    ],
    [
      "reads item ids __proto__, constructor and toString",
      doc(
        progressDocument(
          [],
          ["__proto__", "constructor", "toString"].map((itemId) => ({ ...card, itemId })),
        ),
      ),
      accepted,
    ],
    [
      "reads a grade with no items",
      doc(withAttempt({ grade: { score: 0, max: 0, items: [] } })),
      accepted,
    ],
    ["reads a time of 1, just after the epoch", doc(withAttempt({ at: 1 })), accepted],

    ["refuses text that isn't JSON", doc("{oops"), refused("INVALID_DOCUMENT", "not-json")],
    [
      "refuses another format",
      doc({ ...progressDocument(), format: "hm-learn-content" }),
      refused("UNSUPPORTED_FORMAT", "unknown-format"),
    ],
    [
      "refuses a later version",
      doc({ ...progressDocument(), version: 2 }),
      refused("UNSUPPORTED_FORMAT", "unknown-format-version"),
    ],
    [
      "refuses a document without cards",
      doc({ format: "hm-learn-progress", version: 1, attempts: [] }),
      malformed,
    ],
    ["refuses an unknown field in an attempt", doc(withAttempt({ correct: true })), malformed],
    [
      "refuses a __proto__ field in an attempt",
      doc(
        fromText(
          `{"format":"hm-learn-progress","version":1,"attempts":[{"exerciseId":"e","answer":1,"grade":{"score":0,"max":1,"items":[false]},"at":${T},"__proto__":{}}],"cards":[]}`,
        ),
      ),
      malformed,
    ],
    [
      "refuses a constructor field in a grade",
      doc(
        fromText(
          `{"format":"hm-learn-progress","version":1,"attempts":[{"exerciseId":"e","answer":1,"grade":{"score":0,"max":1,"items":[false],"constructor":1},"at":${T}}],"cards":[]}`,
        ),
      ),
      malformed,
    ],
    [
      "refuses a toString field in a scheduling envelope",
      doc(
        fromText(
          `{"format":"hm-learn-progress","version":1,"attempts":[],"cards":[{"itemId":"w","scheduling":{"scheduler":"s","model":"m","version":1,"card":{},"toString":1},"due":${T}}]}`,
        ),
      ),
      malformed,
    ],
    [
      "refuses an attempt without an answer",
      doc(progressDocument([{ exerciseId: "mc", grade: attempt.grade, at: T }])),
      malformed,
    ],
    [
      "refuses a card without a scheduler state",
      doc(withScheduling({ card: undefined })),
      malformed,
    ],
    [
      "refuses a score over the max",
      doc(withAttempt({ grade: { score: 2, max: 1, items: [true] } })),
      malformed,
    ],
    [
      "refuses a grade item that isn't true or false",
      doc(withAttempt({ grade: { score: 0, max: 1, items: [1] } })),
      malformed,
    ],
    ["refuses a time of 0", doc(withAttempt({ at: 0 })), malformed],
    ["refuses a negative time", doc(withCard({ due: -1 })), malformed],
    ["refuses a time that isn't whole", doc(withCard({ due: T + 0.5 })), malformed],
    ["refuses a blank exercise id", doc(withAttempt({ exerciseId: " " })), malformed],
    [
      "refuses a scheduler version that isn't whole",
      doc(withScheduling({ version: 1.5 })),
      malformed,
    ],
    [
      "refuses an item id of 2,001 emoji",
      doc(withCard({ itemId: emoji(2_001) })),
      refused("TEXT_TOO_LONG"),
    ],
    [
      "refuses a grade of 101 items",
      doc(withAttempt({ grade: { score: 0, max: 101, items: Array(101).fill(false) } })),
      refused("TOO_MANY_ITEMS"),
    ],
    [
      "refuses text over the size limit",
      doc(JSON.stringify(progressDocument()), { maxContentSize: 100 }),
      refused("CONTENT_TOO_LARGE"),
    ],
    ...generated(progress, readProgress),
  ];
  return file(
    "hm-learn-progress",
    "Reading hm-learn-progress documents (docs/formats/hm-learn-progress.md). input.document is the document, as a JSON value or as JSON text; input.limits, when given, overrides learn-sdk's default limits. expected is the document as the reader writes it back, or the rejection. Answers and scheduler states are opaque, so they come back exactly as given.",
    run(readProgress, cases),
  );
}

// hm-learn-grading

const gapExercise = (answers: string[], options?: string[]) => ({
  id: "gf",
  type: "gap-fill",
  payload: { items: [{ sentence: "___", answers, ...(options ? { options } : {}) }] },
});
const filled = (text: string | null) => ({ filled: [text] });
const tiles = (list: string[], alternatives?: string[][]) => ({
  id: "wo",
  type: "word-order",
  payload: { items: [{ tiles: list, ...(alternatives ? { alternatives } : {}) }] },
});

export function gradingCases(): ConformanceFile {
  const twoQuestions = {
    id: "mc",
    type: "multiple-choice",
    payload: {
      questions: [
        { prompt: "กิน", choices: ["eat", "drink"], correct: 0 },
        { prompt: "ดื่ม", choices: ["eat", "drink", "sleep"], correct: 1 },
      ],
    },
  };
  const cases: HandWritten[] = [
    [
      "multiple choice: both right",
      { exercise: twoQuestions, answer: { selected: [0, 1] } },
      accepted,
    ],
    [
      "multiple choice: one wrong, one skipped",
      { exercise: twoQuestions, answer: { selected: [1, null] } },
      accepted,
    ],
    [
      "multiple choice: refuses an answer for one question of two",
      { exercise: twoQuestions, answer: { selected: [0] } },
      malformedAnswer,
    ],
    [
      "multiple choice: refuses a choice out of range",
      { exercise: twoQuestions, answer: { selected: [0, 3] } },
      malformedAnswer,
    ],
    [
      "multiple choice: refuses an answer that isn't an object",
      { exercise: twoQuestions, answer: [0, 1] },
      malformedAnswer,
    ],
    [
      "multiple choice: refuses an unknown field in an answer",
      { exercise: twoQuestions, answer: { selected: [0, 1], score: 2 } },
      malformedAnswer,
    ],

    [
      "gap fill: Thai, exactly as accepted",
      { exercise: gapExercise(["กิน", "ทาน"]), answer: filled("กิน") },
      accepted,
    ],
    [
      "gap fill: Thai, the second accepted answer",
      { exercise: gapExercise(["กิน", "ทาน"]), answer: filled("ทาน") },
      accepted,
    ],
    [
      "gap fill: Thai, a different word",
      { exercise: gapExercise(["กิน"]), answer: filled("กับ") },
      accepted,
    ],
    [
      "gap fill: Thai sara am written as nikhahit and sara aa doesn't match: NFC keeps them apart, and only a language profile may unify them",
      { exercise: gapExercise(["น้ำ"]), answer: filled("นํ้า") },
      accepted,
    ],
    [
      "gap fill: Thai tone mark and vowel in another order don't match under NFC alone",
      { exercise: gapExercise(["ที่"]), answer: filled("ท่ี") },
      accepted,
    ],
    [
      "gap fill: Latin, composed and decomposed accents match after NFC",
      { exercise: gapExercise(["café"]), answer: filled("café") },
      accepted,
    ],
    [
      "gap fill: Vietnamese, stacked accents match after NFC",
      { exercise: gapExercise(["phở"]), answer: filled("phở") },
      accepted,
    ],
    [
      "gap fill: Korean, conjoining jamo match the syllable after NFC",
      { exercise: gapExercise(["한"]), answer: filled("한") },
      accepted,
    ],
    [
      "gap fill: letter case matters without a language profile",
      { exercise: gapExercise(["mange"]), answer: filled("Mange") },
      accepted,
    ],
    [
      "gap fill: spaces around an answer matter without a language profile",
      { exercise: gapExercise(["mange"]), answer: filled(" mange") },
      accepted,
    ],
    [
      "gap fill: an empty answer is wrong",
      { exercise: gapExercise(["mange"]), answer: filled("") },
      accepted,
    ],
    [
      "gap fill: a skipped gap is wrong",
      { exercise: gapExercise(["mange"]), answer: filled(null) },
      accepted,
    ],
    [
      "gap fill: an accepted answer counts even when it isn't among the options",
      { exercise: gapExercise(["กิน", "ทาน"], ["กิน", "ดื่ม"]), answer: filled("ทาน") },
      accepted,
    ],
    [
      "gap fill: refuses an answer that isn't text",
      { exercise: gapExercise(["กิน"]), answer: { filled: [1] } },
      malformedAnswer,
    ],
    [
      "gap fill: refuses two answers for one gap",
      { exercise: gapExercise(["กิน"]), answer: { filled: ["กิน", "กิน"] } },
      malformedAnswer,
    ],

    [
      "word order: the tiles' own order",
      { exercise: tiles(["ฉัน", "กิน", "ข้าว"]), answer: { orders: [[0, 1, 2]] } },
      accepted,
    ],
    [
      "word order: another order is wrong",
      { exercise: tiles(["ฉัน", "กิน", "ข้าว"]), answer: { orders: [[1, 0, 2]] } },
      accepted,
    ],
    [
      "word order: an alternative order is right",
      {
        exercise: tiles(["Yesterday", "I", "ran"], [["I", "ran", "Yesterday"]]),
        answer: { orders: [[1, 2, 0]] },
      },
      accepted,
    ],
    [
      "word order: swapping two identical tiles is still right",
      {
        exercise: tiles(["the", "cat", "saw", "the", "dog"]),
        answer: { orders: [[3, 1, 2, 0, 4]] },
      },
      accepted,
    ],
    [
      "word order: a skipped item is wrong",
      { exercise: tiles(["ฉัน", "กิน"]), answer: { orders: [null] } },
      accepted,
    ],
    [
      "word order: refuses a tile placed twice",
      { exercise: tiles(["ฉัน", "กิน"]), answer: { orders: [[0, 0]] } },
      malformedAnswer,
    ],
    [
      "word order: refuses a tile out of range",
      { exercise: tiles(["ฉัน", "กิน"]), answer: { orders: [[0, 2]] } },
      malformedAnswer,
    ],
    [
      "word order: refuses too few tiles",
      { exercise: tiles(["ฉัน", "กิน", "ข้าว"]), answer: { orders: [[0, 1]] } },
      malformedAnswer,
    ],

    [
      "refuses an exercise of a type the host didn't register",
      { exercise: { id: "e", type: "essay", payload: {} }, answer: {} },
      malformed,
    ],
  ];
  return file(
    "hm-learn-grading",
    "Grading an answer with learn-sdk's default language profile, which applies Unicode NFC and nothing else: no case folding, trimming or locale rules, and no ICU. input.exercise is one exercise, read as an hm-learn-content document of its own, and input.answer the learner's answer. expected is the grade, or the rejection.",
    run(grade, cases),
  );
}

// hm-learn-access

const course = (code: string, position: number) => ({
  code,
  title: `Course ${code}`,
  level: code.slice(0, 1),
  position,
});
const COURSES = [course("A2", 2), course("A1", 1), course("B1", 3)];

export function accessCases(): ConformanceFile {
  const learner = (enrolments: [string, "active" | "completed"][]) => ({
    role: "learner",
    enrolments: enrolments.map(([code, status]) => ({ course: code, status })),
  });
  const cases: HandWritten[] = [
    [
      "a teacher opens every course, in course order",
      { learner: { role: "teacher", enrolments: [] }, courses: COURSES },
      accepted,
    ],
    [
      "a learner opens a course they're enrolled in",
      { learner: learner([["A1", "active"]]), courses: COURSES },
      accepted,
    ],
    [
      "a learner keeps a course they've completed",
      {
        learner: learner([
          ["A1", "completed"],
          ["A2", "active"],
        ]),
        courses: COURSES,
      },
      accepted,
    ],
    [
      "a learner without enrolments opens nothing",
      { learner: learner([]), courses: COURSES },
      accepted,
    ],
    [
      "enrolment in a later course opens no earlier ones: access is never a range",
      { learner: learner([["B1", "active"]]), courses: COURSES },
      accepted,
    ],
    [
      "an enrolment in a course that isn't listed opens nothing",
      { learner: learner([["C1", "active"]]), courses: COURSES },
      accepted,
    ],
    [
      "courses at the same position keep the order given",
      {
        learner: { role: "teacher", enrolments: [] },
        courses: [course("B2", 1), course("A1", 1), course("Z9", 0)],
      },
      accepted,
    ],
    [
      "course codes __proto__, constructor and toString are ordinary codes",
      {
        learner: learner([
          ["__proto__", "active"],
          ["toString", "active"],
        ]),
        courses: [course("__proto__", 1), course("constructor", 2), course("toString", 3)],
      },
      accepted,
    ],
  ];
  return file(
    "hm-learn-access",
    "Which courses a learner may open (learn-sdk ADR 0001): input.learner is a learner, and input.courses the courses. expected is the codes of the courses they may open, sorted by position, with courses at the same position in the order given.",
    run(access, cases),
  );
}

// hm-learn-progress-changes

export function progressChangeCases(): ConformanceFile {
  const review = (itemId: string, due: number, card: unknown = { n: due }) => ({
    kind: "review",
    itemId,
    rating: "good",
    scheduling: { scheduler: "fake", model: "doubling", version: 1, card },
    due,
    at: T,
  });
  const second = { ...card, itemId: "ข้าว" };
  const cases: HandWritten[] = [
    [
      "no changes leave progress as it was",
      { progress: progressDocument(), changes: [] },
      accepted,
    ],
    [
      "attempts are appended in order",
      {
        progress: progressDocument(),
        changes: [
          { kind: "attempt", ...attempt, at: T + 1 },
          { kind: "attempt", ...attempt, answer: { selected: [1] }, at: T + 2 },
        ],
      },
      accepted,
    ],
    [
      "a review of a new item appends its card",
      { progress: progressDocument(), changes: [review("น้ำ", T + DAY)] },
      accepted,
    ],
    [
      "a review replaces its item's card, which keeps its place",
      { progress: progressDocument([], [card, second]), changes: [review("กิน", T + DAY)] },
      accepted,
    ],
    [
      "the last of two reviews of an item wins",
      {
        progress: progressDocument([], []),
        changes: [review("w", T + DAY), review("w", T + 2 * DAY)],
      },
      accepted,
    ],
    [
      "item ids __proto__ and constructor are ordinary ids",
      {
        progress: progressDocument([], []),
        changes: [
          review("__proto__", T + DAY),
          review("constructor", T + DAY),
          review("__proto__", T + 2 * DAY),
        ],
      },
      accepted,
    ],
    [
      "refuses progress that isn't hm-learn-progress",
      { progress: { attempts: [], cards: [] }, changes: [] },
      refused("UNSUPPORTED_FORMAT", "unknown-format"),
    ],
  ];
  return file(
    "hm-learn-progress-changes",
    "Changes applied to stored progress, as a progress store saves them (learn-sdk ADR 0003): input.progress is an hm-learn-progress document, and input.changes the changes in order. An attempt is appended; a review replaces its item's card where it is, or appends a new item's card. expected is the hm-learn-progress document after the changes, or the rejection of the progress.",
    run(applyChanges, cases),
  );
}

// hm-learn-scheduling

export function schedulingCases(): ConformanceFile {
  type Run = Partial<Record<"start" | "state" | "options" | "reviews", unknown>>;
  const fsrs = (input: Run) => ({ scheduler: "fsrs", ...input }) as SchedulingInput;
  const fake = (input: Run) => ({ scheduler: "fake", ...input }) as SchedulingInput;
  const firstFsrs = schedule(fsrs({ start: T, reviews: [{ rating: "good", at: T }] }))[1]?.state;
  const firstFake = schedule(fake({ start: T, reviews: [{ rating: "good", at: T }] }))[1]?.state;
  const cases: HandWritten[] = [
    ...(["again", "hard", "good", "easy"] as const).map(
      (rating): HandWritten => [
        `FSRS-7: a new item rated ${rating}`,
        fsrs({ start: T, reviews: [{ rating, at: T }] }),
        accepted,
        FSRS_TOLERANCE,
      ],
    ),
    [
      "FSRS-7: a run of reviews, with a lapse and relearning",
      fsrs({
        start: T,
        reviews: [
          { rating: "good", at: T },
          { rating: "good", at: T + DAY },
          { rating: "good", at: T + 4 * DAY },
          { rating: "again", at: T + 20 * DAY },
          { rating: "good", at: T + 20 * DAY + 600_000 },
          { rating: "easy", at: T + 22 * DAY },
        ],
      }),
      accepted,
      FSRS_TOLERANCE,
    ],
    [
      "FSRS-7: a review an hour early",
      fsrs({
        start: T,
        reviews: [
          { rating: "good", at: T },
          { rating: "good", at: T + 3_600_000 },
        ],
      }),
      accepted,
      FSRS_TOLERANCE,
    ],
    [
      "FSRS-7: a desired retention of 0.8 schedules later than the default 0.9",
      fsrs({
        options: { desiredRetention: 0.8 },
        start: T,
        reviews: [
          { rating: "good", at: T },
          { rating: "good", at: T + DAY },
          { rating: "good", at: T + 5 * DAY },
        ],
      }),
      accepted,
      FSRS_TOLERANCE,
    ],
    [
      "FSRS-7: a review from a stored state",
      fsrs({ state: firstFsrs as SchedulingState, reviews: [{ rating: "hard", at: T + 2 * DAY }] }),
      accepted,
      FSRS_TOLERANCE,
    ],
    [
      "FSRS-7: refuses the fake scheduler's state",
      fsrs({ state: firstFake as SchedulingState, reviews: [{ rating: "good", at: T }] }),
      refused("UNSUPPORTED_SCHEDULING_STATE", "unknown-scheduler"),
    ],
    [
      "FSRS-7: refuses a state of another model",
      fsrs({
        state: { ...(firstFsrs as SchedulingState), model: "FSRS-6" },
        reviews: [{ rating: "good", at: T }],
      }),
      refused("UNSUPPORTED_SCHEDULING_STATE", "unknown-scheduler"),
    ],
    [
      "FSRS-7: refuses a state of a later version",
      fsrs({
        state: { ...(firstFsrs as SchedulingState), version: 2 },
        reviews: [{ rating: "good", at: T }],
      }),
      refused("UNSUPPORTED_SCHEDULING_STATE", "unknown-scheduler"),
    ],
    [
      "FSRS-7: refuses a malformed state of its own",
      fsrs({
        state: { ...(firstFsrs as SchedulingState), card: {} },
        reviews: [{ rating: "good", at: T }],
      }),
      refused("UNSUPPORTED_SCHEDULING_STATE", "malformed-state"),
    ],
    [
      "fake: intervals double with each review, and start again after again",
      fake({
        start: T,
        reviews: [
          { rating: "good", at: T },
          { rating: "good", at: T + DAY },
          { rating: "again", at: T + 3 * DAY },
          { rating: "easy", at: T + 3 * DAY },
        ],
      }),
      accepted,
    ],
    [
      "fake: refuses FSRS-7's state",
      fake({ state: firstFsrs as SchedulingState, reviews: [{ rating: "good", at: T }] }),
      refused("UNSUPPORTED_SCHEDULING_STATE", "unknown-scheduler"),
    ],
    [
      "fake: refuses a malformed state of its own",
      fake({
        state: { ...(firstFake as SchedulingState), card: { reviews: -1 } },
        reviews: [{ rating: "good", at: T }],
      }),
      refused("UNSUPPORTED_SCHEDULING_STATE", "malformed-state"),
    ],
  ];
  return file(
    "hm-learn-scheduling",
    'Spaced repetition (learn-sdk ADR 0004): FSRS-7 without fuzzing ("fsrs", with optional desiredRetention and weights), and the fake scheduler from @hussmartinez/learn-sdk/testing ("fake"). input.start begins with a new item\'s state at that time, or input.state continues from a stored one; input.reviews are applied in order. expected is every state in turn with its due time, the new item\'s first, or the rejection. Times are milliseconds since the Unix epoch. FSRS-7 states hold computed floats, compared within the case\'s tolerance.',
    run(schedule, cases),
  );
}

/** Every file, by its name in conformance/. */
export const conformanceFiles = {
  "hm-learn-content.json": contentCases,
  "hm-learn-progress.json": progressCases,
  "hm-learn-grading.json": gradingCases,
  "hm-learn-access.json": accessCases,
  "hm-learn-progress-changes.json": progressChangeCases,
  "hm-learn-scheduling.json": schedulingCases,
} as const;
