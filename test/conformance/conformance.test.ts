import {
  type ConformanceCase,
  describeConformance,
  readConformance,
  schemaValidator,
} from "@hussmartinez/sdk-config/testing/conformance";
import { describe, expect, it } from "vitest";
import { conformanceFiles } from "./generate.js";
import { access, applyChanges, grade, readContent, readProgress, schedule } from "./run.js";

/**
 * The conformance vectors (sdk-core ADR 0045): the same files a port in
 * another language runs, checked here against the TypeScript SDK.
 */

const at = (name: string) => new URL(`../../conformance/${name}`, import.meta.url);
const text = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

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
});
