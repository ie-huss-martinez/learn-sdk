import {
  accessibleCourses,
  applyProgressChanges,
  type Content,
  type Course,
  createExerciseTypes,
  createFsrsScheduler,
  defineExerciseType,
  type FsrsSchedulerOptions,
  type Grade,
  gapFill,
  gradeAnswer,
  type Learner,
  type LearnLimitOverrides,
  multipleChoice,
  type ProgressChange,
  type ProgressDocument,
  parseContent,
  parseProgress,
  type Rating,
  type Scheduled,
  type Scheduler,
  type SchedulingState,
  toProgressDocument,
  wordOrder,
} from "../../src/index.js";
import { createFakeScheduler } from "../../src/testing.js";

/**
 * How the TypeScript SDK runs each conformance subject: what a port in
 * another language implements too (sdk-core ADR 0045). There's one runner
 * per subject, shared by the generator that writes the cases and the tests
 * that check them. conformance/README.md describes them for ports.
 */

/**
 * A host's exercise type, as every port registers it for the vectors:
 * `"free-form"` takes any object as its payload and returns it unchanged.
 * It shows how a reader treats a type it doesn't know the shape of.
 */
export const freeForm = defineExerciseType<object, unknown>({
  type: "free-form",
  validate: (payload) => payload as object,
  validateAnswer: (answer) => answer,
  grade: () => ({ score: 0, max: 0, items: [] }),
});

/** The built-in types and `"free-form"`. */
export const types = createExerciseTypes([multipleChoice, gapFill, wordOrder, freeForm]);

/** Whether a call returns, rather than throws. */
export const accepts = (read: () => unknown): boolean => {
  try {
    read();
    return true;
  } catch {
    return false;
  }
};

/** A document, as a JSON value or as JSON text, with limits other than the defaults. */
export interface DocumentInput {
  readonly document: unknown;
  readonly limits?: LearnLimitOverrides;
}

/** `hm-learn-content`: a document read, giving the content as the reader returns it. */
export function readContent({ document, limits }: DocumentInput): Content {
  return parseContent(document, { types, ...(limits ? { limits } : {}) });
}

/** `hm-learn-progress`: a document read and written back. */
export function readProgress({ document, limits }: DocumentInput): ProgressDocument {
  return toProgressDocument(parseProgress(document, limits ? { limits } : {}));
}

/**
 * `hm-learn-grading`: one exercise, read as an `hm-learn-content` document
 * of its own, and an answer graded with the default language profile
 * (Unicode NFC only), giving the grade.
 */
export function grade({ exercise, answer }: { exercise: unknown; answer: unknown }): Grade {
  const [read] = readContent({
    document: { format: "hm-learn-content", version: 1, exercises: [exercise] },
  }).exercises;
  if (!read) {
    throw new Error("The case's exercise didn't read.");
  }
  return gradeAnswer(read, answer, { types });
}

/** `hm-learn-access`: the codes of the courses a learner may open, in course order. */
export function access({ learner, courses }: { learner: Learner; courses: Course[] }): string[] {
  return accessibleCourses(learner, courses).map((course) => course.code);
}

/** `hm-learn-progress-changes`: changes applied to a progress document, giving the new one. */
export function applyChanges({
  progress,
  changes,
}: {
  progress: unknown;
  changes: ProgressChange[];
}): ProgressDocument {
  return toProgressDocument(applyProgressChanges(parseProgress(progress), changes));
}

/** The schedulers a port reproduces: FSRS-7, with its options, and the fake from `./testing`. */
export type SchedulingInput = {
  readonly scheduler: "fsrs" | "fake";
  readonly options?: FsrsSchedulerOptions;
  readonly reviews: readonly { readonly rating: Rating; readonly at: number }[];
} & ({ readonly start: number } | { readonly state: SchedulingState });

/**
 * `hm-learn-scheduling`: a run of reviews, from a new item's state at
 * `start`, or from a given `state`. Gives every state in turn, the new one
 * first when there is one, each with its due time.
 */
export function schedule(input: SchedulingInput): Scheduled[] {
  const scheduler: Scheduler =
    input.scheduler === "fsrs" ? createFsrsScheduler(input.options) : createFakeScheduler();
  const states: Scheduled[] = "start" in input ? [scheduler.initial(input.start)] : [];
  let state = "state" in input ? input.state : (states[0] as Scheduled).state;
  for (const { rating, at } of input.reviews) {
    const next = scheduler.review(state, rating, at);
    states.push(next);
    state = next.state;
  }
  return states;
}
