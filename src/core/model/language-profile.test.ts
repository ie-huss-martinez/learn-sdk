import { afterEach, describe, expect, it } from "vitest";
import {
  defaultLanguageProfile,
  type LanguageProfile,
  normalizeForGrading,
} from "./language-profile.js";

// Made-up profiles for the tests. Real profiles, with their language data,
// belong to host applications.
const spaceless: LanguageProfile = {
  code: "th",
  direction: "ltr",
  normalizeAnswer: (text) => text.replace(/\s+/g, ""),
};
const caseless: LanguageProfile = {
  code: "es",
  direction: "ltr",
  normalizeAnswer: (text) => text.trim().replace(/\s+/g, " ").toLowerCase(),
};

// Pairs that must normalise equal, and pairs that must stay different.
const corpus = (): boolean[] => [
  normalizeForGrading("café", defaultLanguageProfile) ===
    normalizeForGrading("café", defaultLanguageProfile),
  normalizeForGrading("  CAFÉ ", caseless) === normalizeForGrading("café", caseless),
  normalizeForGrading("cafe", caseless) === normalizeForGrading("café", caseless),
  normalizeForGrading("กิน ข้าว", spaceless) === normalizeForGrading("กินข้าว", spaceless),
  // NFC doesn't unify sara am typed as two characters; that's a profile's job (ADR 0004).
  normalizeForGrading("ทํา", spaceless) === normalizeForGrading("ทำ", spaceless),
];
const EXPECTED = [true, true, false, true, false];

describe("normalizeForGrading", () => {
  const intl = globalThis.Intl;
  afterEach(() => {
    globalThis.Intl = intl;
  });

  it("applies NFC, then the profile's rules", () => {
    expect(corpus()).toEqual(EXPECTED);
  });

  it("gives the same results without Intl, as in runtimes with less ICU data", () => {
    // @ts-expect-error -- removed on purpose: grading must not depend on it.
    delete globalThis.Intl;
    expect(typeof globalThis.Intl).toBe("undefined");
    expect(corpus()).toEqual(EXPECTED);
  });

  it("uses only NFC when the profile has no rules", () => {
    expect(normalizeForGrading(" Ab ", defaultLanguageProfile)).toBe(" Ab ");
  });

  it("rejects a profile whose rules don't return a string", () => {
    const broken = {
      code: "xx",
      direction: "ltr",
      normalizeAnswer: () => 42,
    } as unknown as LanguageProfile;
    expect(() => normalizeForGrading("a", broken)).toThrow(TypeError);
  });

  it("never calls segment, which is for display only", () => {
    let called = false;
    const profile: LanguageProfile = {
      ...spaceless,
      segment: (text) => {
        called = true;
        return [text];
      },
    };
    normalizeForGrading("กิน ข้าว", profile);
    expect(called).toBe(false);
  });
});

describe("defaultLanguageProfile", () => {
  it("is an undetermined language, left to right, and frozen", () => {
    expect(defaultLanguageProfile).toEqual({ code: "und", direction: "ltr" });
    expect(Object.isFrozen(defaultLanguageProfile)).toBe(true);
  });
});
