import { describe, expect, it } from "vitest";
import { accessibleCourses, canAccessCourse } from "./access.js";
import type { Learner } from "./course.js";

const courses = Array.from({ length: 9 }, (_, i) => ({
  code: `lang-${i + 1}`,
  title: `Course ${i + 1}`,
  level: String(Math.floor(i / 3) + 1),
  position: i + 1,
}));

describe("course access", () => {
  it("is the set of enrolments, never a range: courses 1–3 done and 7 joined leave 4–6 closed", () => {
    const learner: Learner = {
      role: "learner",
      enrolments: [
        { course: "lang-1", status: "completed" },
        { course: "lang-2", status: "completed" },
        { course: "lang-3", status: "completed" },
        { course: "lang-7", status: "active" },
      ],
    };
    expect(accessibleCourses(learner, courses).map((c) => c.code)).toEqual([
      "lang-1",
      "lang-2",
      "lang-3",
      "lang-7",
    ]);
    for (const closed of ["lang-4", "lang-5", "lang-6", "lang-8", "lang-9"]) {
      expect(canAccessCourse(learner, closed), closed).toBe(false);
    }
  });

  it("keeps completed courses open", () => {
    const learner: Learner = {
      role: "learner",
      enrolments: [{ course: "lang-2", status: "completed" }],
    };
    expect(canAccessCourse(learner, "lang-2")).toBe(true);
  });

  it("gives a learner with no enrolments nothing, and a teacher everything", () => {
    expect(accessibleCourses({ role: "learner", enrolments: [] }, courses)).toEqual([]);
    expect(accessibleCourses({ role: "teacher", enrolments: [] }, courses)).toHaveLength(9);
  });

  it("returns courses in curriculum order, without changing the list it was given", () => {
    const shuffled = [courses[6], courses[0], courses[2]].filter((c) => c !== undefined);
    const learner: Learner = {
      role: "learner",
      enrolments: shuffled.map((c) => ({ course: c.code, status: "active" as const })),
    };
    expect(accessibleCourses(learner, shuffled).map((c) => c.position)).toEqual([1, 3, 7]);
    expect(shuffled.map((c) => c.position)).toEqual([7, 1, 3]);
  });

  it("matches course codes exactly", () => {
    const learner: Learner = {
      role: "learner",
      enrolments: [{ course: "lang-1", status: "active" }],
    };
    expect(canAccessCourse(learner, "lang-10")).toBe(false);
    expect(canAccessCourse(learner, "LANG-1")).toBe(false);
  });
});
