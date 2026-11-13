/**
 * Headless core of the learn SDK: the content model, exercise types and their
 * grading, sessions, ports and errors.
 *
 * @remarks
 * This entry is server-safe: it has no React and touches no DOM on import, so
 * Server Components, Node and Workers runtimes can import it, and a host can
 * grade on its server with the same code the browser uses (ADR 0004, ADR 0007).
 *
 * @packageDocumentation
 */

export type { LearnErrorCode } from "./core/errors/learn-error.js";
export { isLearnError, LearnError } from "./core/errors/learn-error.js";
export type { LearnIssue, LearnIssueCode } from "./core/errors/learn-issues.js";
export { MAX_ISSUE_KEY_LENGTH } from "./core/errors/learn-issues.js";
export type {
  LearnLimitDefinitions,
  LearnLimitName,
  LearnLimitOverrides,
  LearnLimitPolicy,
} from "./core/errors/learn-limits.js";
export { learnLimitDefinitions, learnLimits } from "./core/errors/learn-limits.js";
export { accessibleCourses, canAccessCourse } from "./core/model/access.js";
export type {
  Course,
  Enrolment,
  EnrolmentStatus,
  Learner,
  LearnRole,
  Level,
} from "./core/model/course.js";
export type { LanguageProfile, TextDirection } from "./core/model/language-profile.js";
export { defaultLanguageProfile, normalizeForGrading } from "./core/model/language-profile.js";
export type { LearnMessageCatalogue } from "./messages/en.js";
export { learnMessages } from "./messages/en.js";
