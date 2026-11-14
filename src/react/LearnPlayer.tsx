import {
  AnnouncerProvider,
  Button,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  RotateLeftIcon,
  SkipForwardIcon,
  Toolbar,
  UiMessagesProvider,
  useAnnounce,
  usePlatform,
} from "@hussmartinez/ui/react";
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
} from "react";
import { isLearnError } from "../core/errors/learn-error.js";
import type {
  LearnPlayer as LearnPlayerSession,
  LearnPlayerSnapshot,
} from "../core/session/player.js";
import { classes } from "../features/player/roving.js";
import {
  type LearnPlayerProps,
  LearnPlayerProvider,
  usePlayerContext,
  usePlayerSnapshot,
} from "./player-context.js";

/**
 * What a ref to {@link LearnPlayer} can do.
 *
 * @public
 */
export interface LearnPlayerHandle {
  /** Checks the current answer, as the Check button does. */
  check(): void;
  /** Moves to the next exercise. */
  next(): void;
  /** Starts the exercises again, from a new session. Recorded attempts stay recorded. */
  reset(): void;
}

const ICONS: Readonly<Record<string, ReactNode>> = {
  check: <CheckIcon aria-hidden="true" />,
  "chevron-left": <ChevronLeftIcon aria-hidden="true" />,
  "chevron-right": <ChevronRightIcon aria-hidden="true" />,
  "rotate-left": <RotateLeftIcon aria-hidden="true" />,
  "skip-forward": <SkipForwardIcon aria-hidden="true" />,
};

/** Runs a tool, sending a `LearnError` to `onError` rather than out of an event handler. */
function useRunTool(
  player: LearnPlayerSession,
  snapshot: LearnPlayerSnapshot,
  onError: (error: unknown) => void,
) {
  const { tools } = usePlayerContext();
  return useCallback(
    (id: string): boolean => {
      const tool = tools.get(id);
      if (!tool || (tool.isEnabled && !tool.isEnabled({ snapshot }))) return false;
      try {
        void tool.run({ player });
      } catch (error) {
        onError(error);
      }
      return true;
    },
    [tools, player, snapshot, onError],
  );
}

function PlayerToolbar({
  run,
  snapshot,
}: {
  readonly run: (id: string) => boolean;
  readonly snapshot: LearnPlayerSnapshot;
}): ReactNode {
  const { tools, shortcuts, messages } = usePlayerContext();
  const platform = usePlatform();
  return (
    <Toolbar label={messages.t("player.toolbar")} className="hm-learn-toolbar">
      {tools.tools.map((tool) => {
        const label = messages.t(tool.label as "tools.check");
        const [keys] = shortcuts.describe(tool.id);
        const description = keys
          ? messages.t("player.withKeys", {
              label,
              keys: keys
                .map((part) =>
                  part.message ? messages.t(part.message as "keys.control") : part.value,
                )
                .join(platform === "apple" ? "" : "+"),
            })
          : undefined;
        return (
          <Button
            key={tool.id}
            variant={tool.id === "learn.check" ? "primary" : "secondary"}
            startIcon={ICONS[tool.icon]}
            disabled={!(tool.isEnabled?.({ snapshot }) ?? true)}
            // Focus stays on a button that a check disables (ADR 0005).
            focusableWhenDisabled
            aria-keyshortcuts={shortcuts.ariaKeyShortcuts(tool.id)}
            title={description}
            onClick={() => run(tool.id)}
          >
            {label}
          </Button>
        );
      })}
    </Toolbar>
  );
}

function Exercise({
  player,
  snapshot,
}: {
  readonly player: LearnPlayerSession;
  readonly snapshot: LearnPlayerSnapshot;
}): ReactNode {
  const { messages, profile, blocks } = usePlayerContext();
  const announce = useAnnounce();
  const exercise = snapshot.content.exercises[snapshot.position];
  const state = snapshot.exercises[snapshot.position];
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const shown = useRef(snapshot.position);

  // After moving, focus goes to the new exercise's heading (ADR 0005).
  useEffect(() => {
    if (shown.current !== snapshot.position) {
      shown.current = snapshot.position;
      heading.current?.focus();
    }
  }, [snapshot.position]);

  if (!exercise || !state) return null;
  const position = messages.t("player.position", {
    position: snapshot.position + 1,
    count: snapshot.exercises.length,
  });
  const Block = blocks[exercise.type];
  return (
    <article className="hm-learn-exercise" aria-labelledby={headingId}>
      <p className="hm-learn-position">{position}</p>
      <h2 ref={heading} id={headingId} className="hm-learn-title" tabIndex={-1}>
        {exercise.title ?? position}
      </h2>
      {exercise.instructions && <p className="hm-learn-instructions">{exercise.instructions}</p>}
      {Block ? (
        <Block
          key={exercise.id}
          exercise={exercise}
          answer={state.draft}
          onAnswer={(answer) => player.answer(answer)}
          grade={state.grade}
          profile={profile}
          messages={messages}
          announce={announce}
        />
      ) : (
        <p className="hm-learn-unsupported">{messages.t("player.unsupported")}</p>
      )}
      {state.status === "checked" && state.grade && (
        <p
          className="hm-learn-result"
          data-hm-result={state.grade.score === state.grade.max ? "right" : "wrong"}
        >
          {state.grade.score === state.grade.max ? (
            <CheckIcon aria-hidden="true" />
          ) : (
            <CloseIcon aria-hidden="true" />
          )}
          <span>
            {messages.t("player.result", { score: state.grade.score, max: state.grade.max })}
          </span>
        </p>
      )}
      {state.status === "skipped" && (
        <p className="hm-learn-result">{messages.t("player.skipped")}</p>
      )}
    </article>
  );
}

function Session({
  player,
  className,
}: {
  readonly player: LearnPlayerSession;
  readonly className?: string | undefined;
}): ReactNode {
  const { messages, shortcuts, reportError } = usePlayerContext();
  const snapshot = usePlayerSnapshot(player) as LearnPlayerSnapshot;
  const announce = useAnnounce();
  const onError = useCallback(
    (error: unknown) => {
      if (!isLearnError(error)) throw error;
      announce(messages.error(error), { politeness: "assertive" });
      reportError(error);
    },
    [announce, messages, reportError],
  );
  const run = useRunTool(player, snapshot, onError);

  // Each check's result, and the summary, are announced (ADR 0005).
  const current = snapshot.exercises[snapshot.position];
  const announced = useRef<unknown>(null);
  useEffect(() => {
    if (current?.status !== "checked" || !current.grade || announced.current === current.grade)
      return;
    announced.current = current.grade;
    const { score, max } = current.grade;
    announce(
      score === max ? messages.t("player.correct") : messages.t("player.result", { score, max }),
    );
  }, [current, announce, messages]);
  const summary = snapshot.summary;
  useEffect(() => {
    if (summary) announce(messages.t("player.summary", { score: summary.score, max: summary.max }));
  }, [summary, announce, messages]);

  return (
    <section
      className={classes("hm-learn-player", className)}
      aria-label={messages.t("player.label")}
      onKeyDown={(event) => {
        const id = shortcuts.match(event.nativeEvent, { root: event.currentTarget });
        if (id && run(id)) event.preventDefault();
      }}
    >
      <Exercise player={player} snapshot={snapshot} />
      {snapshot.save === "failed" && (
        <div className="hm-learn-save-failed">
          <p>{messages.t("player.saveFailed")}</p>
          <Button variant="secondary" size="small" onClick={() => player.retrySave()}>
            {messages.t("player.retrySave")}
          </Button>
        </div>
      )}
      {summary && (
        <div className="hm-learn-summary">
          <p>{messages.t("player.summary", { score: summary.score, max: summary.max })}</p>
          {summary.skipped > 0 && (
            <p>{messages.t("player.summarySkipped", { count: summary.skipped })}</p>
          )}
        </div>
      )}
      <PlayerToolbar run={run} snapshot={snapshot} />
    </section>
  );
}

const Shell = forwardRef<LearnPlayerHandle, { readonly className?: string | undefined }>(
  function Shell({ className }, ref): ReactNode {
    const { player, error, messages, reset } = usePlayerContext();
    useImperativeHandle(
      ref,
      () => ({
        check: () => player?.check(),
        next: () => player?.next(),
        reset,
      }),
      [player, reset],
    );
    return (
      // One Messages object for the SDK's text and ui's (sdk-core ADR 0046).
      <UiMessagesProvider messages={messages}>
        <AnnouncerProvider>
          {player ? (
            <Session player={player} className={className} />
          ) : (
            <section
              className={classes("hm-learn-player", className)}
              aria-label={messages.t("player.label")}
            >
              <p role="alert" className="hm-learn-error">
                {messages.error(error)}
              </p>
            </section>
          )}
        </AnnouncerProvider>
      </UiMessagesProvider>
    );
  },
);

/**
 * The learner's player (ADR 0001, ADR 0005, ADR 0007): one exercise at a
 * time, with Check, Next, Previous, Try again and Skip, keyboard shortcuts,
 * results that never rely on colour alone, and a polite live region for
 * placements and results.
 *
 * It reads `content` with `parseContent`, grades with `gradeAnswer`, and
 * records each check through `onProgress` and the `progressStore`, without
 * waiting for storage. Invalid content shows its error instead.
 *
 * @example
 * ```tsx
 * import "@hussmartinez/ui/styles.css";
 * import "@hussmartinez/learn-sdk/styles.css";
 * import { LearnPlayer } from "@hussmartinez/learn-sdk/react";
 *
 * <LearnPlayer content={content} profile={thai} onProgress={(change) => save(change)} />
 * ```
 *
 * @public
 */
export const LearnPlayer = /* @__PURE__ */ forwardRef<LearnPlayerHandle, LearnPlayerProps>(
  function LearnPlayer({ className, ...provider }, ref): ReactNode {
    return (
      <LearnPlayerProvider {...provider}>
        <Shell ref={ref} className={className} />
      </LearnPlayerProvider>
    );
  },
);
