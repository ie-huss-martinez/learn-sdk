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

export { createFakeAudioSource } from "./adapters/fakes/fake-audio-source.js";
export { createFakeScheduler } from "./adapters/fakes/fake-scheduler.js";
export { createMemoryProgressStore } from "./adapters/memory-progress/memory-progress.js";
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
export type { Content, Exercise, Grade } from "./core/model/content.js";
export { CONTENT_VERSION } from "./core/model/content.js";
export type {
  Course,
  Enrolment,
  EnrolmentStatus,
  Learner,
  LearnRole,
  Level,
} from "./core/model/course.js";
export type { ExerciseType, ExerciseTypes } from "./core/model/exercise-type.js";
export { createExerciseTypes, defineExerciseType } from "./core/model/exercise-type.js";
export type { LanguageProfile, TextDirection } from "./core/model/language-profile.js";
export { defaultLanguageProfile, normalizeForGrading } from "./core/model/language-profile.js";
export type {
  AttemptRecord,
  CardRecord,
  ProgressChange,
  ProgressSnapshot,
} from "./core/model/progress.js";
export { applyProgressChanges, emptyProgress } from "./core/model/progress.js";
export type { Rating, Scheduled, SchedulingState } from "./core/model/scheduling.js";
export type {
  ListLimit,
  OptionalOption,
  ValidationContext,
} from "./core/model/validation-context.js";
export type { GradeAnswerOptions } from "./core/operations/grade-answer.js";
export { gradeAnswer } from "./core/operations/grade-answer.js";
export type { ParseContentOptions } from "./core/operations/parse-content.js";
export { parseContent } from "./core/operations/parse-content.js";
export type { AudioSource } from "./core/ports/audio-source.js";
export type { LearnCallOptions } from "./core/ports/options.js";
export type { ProgressStore } from "./core/ports/progress-store.js";
export type { Scheduler } from "./core/ports/scheduler.js";
export type { LoadClipOptions } from "./core/session/load-clip.js";
export { loadClip } from "./core/session/load-clip.js";
export type { GapFillAnswer, GapFillItem, GapFillPayload } from "./features/gap-fill/gap-fill.js";
export { gapFill, splitAtGap } from "./features/gap-fill/gap-fill.js";
export type {
  MultipleChoiceAnswer,
  MultipleChoicePayload,
  MultipleChoiceQuestion,
} from "./features/multiple-choice/multiple-choice.js";
export { multipleChoice } from "./features/multiple-choice/multiple-choice.js";
export type {
  WordOrderAnswer,
  WordOrderItem,
  WordOrderPayload,
} from "./features/word-order/word-order.js";
export { wordOrder } from "./features/word-order/word-order.js";
export type { LearnMessageCatalogue } from "./messages/en.js";
export { learnMessages } from "./messages/en.js";
