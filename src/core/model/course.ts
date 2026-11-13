/**
 * A curriculum: levels, each made of courses (ADR 0001). Content belongs to
 * exactly one course, and access is decided per course with
 * {@link canAccessCourse}. These are plain data the host loads from its own
 * storage; the SDK never fetches them.
 */

/**
 * One level of a curriculum, such as "Level 1", grouping several courses.
 *
 * @public
 */
export interface Level {
  /** Stable id, such as `"1"` or `"reading"`. */
  readonly code: string;
  readonly title: string;
  /** The CEFR band the level maps to, if the school uses one, such as `"A1"` or `"A2–B1"`. */
  readonly cefr?: string;
  /** Topics the level covers, for teachers tagging their materials. */
  readonly topics: readonly string[];
  /** Order within the curriculum. */
  readonly position: number;
}

/**
 * One course, such as a month of classes. Learners enrol in courses.
 *
 * @public
 */
export interface Course {
  /** Stable id, such as `"lang-1"` or `"rw-2"`. */
  readonly code: string;
  readonly title: string;
  /** The `code` of the level it belongs to. */
  readonly level: string;
  /** Order within the curriculum. */
  readonly position: number;
}

/**
 * What someone using the SDK does: learners answer exercises, teachers also
 * write them and see every course.
 *
 * @public
 */
export type LearnRole = "learner" | "teacher";

/**
 * Whether a learner is taking a course now, or took it before.
 *
 * @public
 */
export type EnrolmentStatus = "active" | "completed";

/**
 * A learner's enrolment in one course.
 *
 * @public
 */
export interface Enrolment {
  /** The course's `code`. */
  readonly course: string;
  readonly status: EnrolmentStatus;
}

/**
 * Who is asking, as far as access is concerned: their role and their
 * enrolments. It carries no name or identity (ADR 0003).
 *
 * @public
 */
export interface Learner {
  readonly role: LearnRole;
  readonly enrolments: readonly Enrolment[];
}
