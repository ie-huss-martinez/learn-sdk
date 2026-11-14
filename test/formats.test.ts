import { schemaValidator } from "@hussmartinez/sdk-config/testing/conformance";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyLearnCommand, type ContentDraft, parseContent, parseProgress } from "../src/index.js";
import { command } from "./arbitraries/commands.js";
import { content, mutated, progress } from "./arbitraries/documents.js";
import { accepts, types } from "./conformance/run.js";

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

const commandErrors = schemaValidator(
  new URL("../formats/hm-learn-commands/v1.schema.json", import.meta.url),
);

/** A draft with the exercise ids the command generator uses. */
const DRAFT: ContentDraft = {
  format: "hm-learn-content",
  version: 1,
  exercises: ["mc", "gf", "wo"].map((id) => ({ id, type: "free-form", payload: {} })),
};

describe("the format schemas agree with the readers", () => {
  it("never let applyLearnCommand apply a command hm-learn-commands's schema refuses", () => {
    fc.assert(
      fc.property(fc.oneof(command, mutated(command)), (value) => {
        if (accepts(() => applyLearnCommand(DRAFT, value, { types }))) {
          expect(commandErrors(value)).toEqual([]);
        }
      }),
      { numRuns: 3_000 },
    );
  });

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
    expect(
      share(fc.sample(command, { numRuns: 500, seed: 1 }), (value) =>
        applyLearnCommand(DRAFT, value, { types }),
      ),
    ).toBeGreaterThan(0.05);
  });

  it("count text lengths in code points, as the schema's maxLength does", () => {
    const withTitle = (title: string) => ({
      format: "hm-learn-content",
      version: 1,
      exercises: [{ id: "a", type: "free-form", title, payload: {} }],
    });
    const fits = withTitle("😀".repeat(2_000));
    const over = withTitle("😀".repeat(2_001));
    expect([accepts(() => parseContent(fits, { types })), contentErrors(fits)]).toEqual([true, []]);
    expect(accepts(() => parseContent(over, { types }))).toBe(false);
    expect(contentErrors(over)).not.toEqual([]);
  });
});
