import {
  type ConformanceCase,
  describeConformance,
  readConformance,
  schemaValidator,
} from "@hussmartinez/sdk-config/testing/conformance";
import { describe, expect, it } from "vitest";
import { conformanceFiles } from "./generate.js";
import {
  access,
  applyChanges,
  editCommands,
  grade,
  readContent,
  readProgress,
  schedule,
} from "./run.js";

/**
 * The conformance vectors (sdk-core ADR 0045): the same files a port in
 * another language runs, checked here against the TypeScript SDK.
 */

const at = (name: string) => new URL(`../../conformance/${name}`, import.meta.url);
/**
 * Characters that an editor and a diff don't show, or that reorder the text
 * around them: the set `hm-check-hidden-unicode` refuses (sdk-core ADR 0052).
 * JSON.stringify writes them raw, so the vectors write them as `\u` escapes,
 * which read back as the same strings.
 */
const HIDDEN =
  /[\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/gu;
const escapeHidden = (character: string) =>
  Array.from(
    { length: character.length },
    (_, index) => `\\u${character.charCodeAt(index).toString(16).toUpperCase().padStart(4, "0")}`,
  ).join("");
const text = (value: unknown) =>
  `${JSON.stringify(value, null, 2).replace(HIDDEN, escapeHidden)}\n`;

it("writes hidden characters as escapes that read back as the same text", () => {
  const value = { text: "a\u2028b\uFEFFc\u202E\u{E0041}" };
  const written = text(value);
  expect(written).not.toMatch(new RegExp(HIDDEN.source, "u"));
  expect(written).toContain("\\u2028");
  expect(written).toContain("\\uDB40\\uDC41");
  expect(JSON.parse(written)).toEqual(value);
});

it("keeps the checked-in cases up to date with their generator", async () => {
  // `pnpm conformance:update` rewrites them.
  for (const [name, cases] of Object.entries(conformanceFiles)) {
    await expect(text(cases())).toMatchFileSnapshot(`../../conformance/${name}`);
  }
});

describeConformance(at("hm-learn-content.json"), readContent);
describeConformance(at("hm-learn-progress.json"), readProgress);
describeConformance(at("hm-learn-grading.json"), grade);
describeConformance(at("hm-learn-access.json"), access);
describeConformance(at("hm-learn-progress-changes.json"), applyChanges);
describeConformance(at("hm-learn-scheduling.json"), schedule);
describeConformance(at("hm-learn-commands.json"), editCommands);

describe("the format schemas accept every document the vectors read", () => {
  const isRead = ({ input, expected }: ConformanceCase) =>
    !(typeof expected === "object" && expected !== null && "error" in expected) &&
    (input as { limits?: unknown }).limits === undefined;
  const documentOf = ({ input }: ConformanceCase) => {
    const { document } = input as { document: unknown };
    return typeof document === "string" ? JSON.parse(document) : document;
  };

  for (const format of ["hm-learn-content", "hm-learn-progress"]) {
    it(format, () => {
      const errors = schemaValidator(
        new URL(`../../formats/${format}/v1.schema.json`, import.meta.url),
      );
      for (const testCase of readConformance(at(`${format}.json`)).cases.filter(isRead)) {
        expect(errors(documentOf(testCase)), testCase.name).toEqual([]);
      }
    });
  }

  it("hm-learn-progress-changes, before and after", () => {
    const errors = schemaValidator(
      new URL("../../formats/hm-learn-progress/v1.schema.json", import.meta.url),
    );
    for (const testCase of readConformance(at("hm-learn-progress-changes.json")).cases.filter(
      isRead,
    )) {
      expect(errors((testCase.input as { progress: unknown }).progress), testCase.name).toEqual([]);
      expect(errors(testCase.expected), testCase.name).toEqual([]);
    }
  });

  it("hm-learn-commands, every command applied", () => {
    const errors = schemaValidator(
      new URL("../../formats/hm-learn-command/v1.schema.json", import.meta.url),
    );
    for (const testCase of readConformance(at("hm-learn-commands.json")).cases.filter(isRead)) {
      for (const command of (testCase.input as { commands: unknown[] }).commands) {
        expect(errors(command), testCase.name).toEqual([]);
      }
    }
  });
});
