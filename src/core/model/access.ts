import type { Course, Learner } from "./course.js";

/**
 * Whether someone may see a course's materials.
 *
 * Teachers see every course. Learners see a course if they have an enrolment
 * in it, active or completed. Access is the set of enrolments, never a range:
 * a learner who finished courses 1 to 3 and then joined course 7 sees
 * exactly those four, and not courses 4 to 6. Hosts call it on their servers
 * to decide what to send, and in the browser for display.
 *
 * @example
 * ```ts
 * const learner = {
 *   role: "learner",
 *   enrolments: [{ course: "lang-1", status: "completed" }, { course: "lang-7", status: "active" }],
 * } as const;
 * canAccessCourse(learner, "lang-7"); // true
 * canAccessCourse(learner, "lang-4"); // false
 * ```
 *
 * @param learner - The learner's role and enrolments.
 * @param course - The course's `code`.
 * @public
 */
export function canAccessCourse(learner: Learner, course: string): boolean {
  if (learner.role === "teacher") {
    return true;
  }
  return learner.enrolments.some((enrolment) => enrolment.course === course);
}

/**
 * The courses someone may see, from a list, in curriculum order.
 *
 * @param learner - The learner's role and enrolments.
 * @param courses - The curriculum's courses, in any order.
 * @returns A new array; `courses` is left unchanged.
 * @public
 */
export function accessibleCourses<C extends Pick<Course, "code" | "position">>(
  learner: Learner,
  courses: readonly C[],
): C[] {
  return courses
    .filter((course) => canAccessCourse(learner, course.code))
    .sort((a, b) => a.position - b.position);
}
