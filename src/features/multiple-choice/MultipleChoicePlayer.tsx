import { CheckIcon, CloseIcon } from "@hussmartinez/ui/react";
import { type ReactNode, useId } from "react";
import { definePlayerBlock, type PlayerBlockProps } from "../player/player-block.js";
import { useRovingGroup } from "../player/roving.js";
import type {
  MultipleChoiceAnswer,
  MultipleChoicePayload,
  MultipleChoiceQuestion,
} from "./multiple-choice.js";

type Props = PlayerBlockProps<MultipleChoicePayload, MultipleChoiceAnswer>;

function Question({
  question,
  number,
  selected,
  right,
  onSelect,
  props,
}: {
  readonly question: MultipleChoiceQuestion;
  readonly number: number;
  readonly selected: number | null;
  /** Whether the answer was right, once checked. */
  readonly right: boolean | undefined;
  readonly onSelect: (choice: number) => void;
  readonly props: Props;
}): ReactNode {
  const { profile, messages, grade } = props;
  const promptId = useId();
  const group = useRovingGroup(question.choices.length);
  const checked = grade !== null;
  const language = { lang: profile.code, dir: profile.direction };
  return (
    <div className="hm-learn-question">
      <p id={promptId} className="hm-learn-prompt" {...language}>
        {question.prompt}
      </p>
      <fieldset
        className="hm-learn-choices"
        aria-label={messages.t("multipleChoice.choices", { number })}
        aria-describedby={promptId}
      >
        {question.choices.map((choice, index) => (
          <button
            // Choices are fixed for an exercise, so their positions are stable keys.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={index}
            type="button"
            className="hm-learn-choice"
            aria-pressed={selected === index}
            aria-disabled={checked || undefined}
            data-hm-result={
              checked && index === question.correct
                ? "right"
                : checked && index === selected
                  ? "wrong"
                  : undefined
            }
            onClick={() => {
              if (!checked) onSelect(index);
            }}
            {...group.item(index)}
          >
            <span {...language}>{choice}</span>
          </button>
        ))}
      </fieldset>
      {right !== undefined && (
        <p className="hm-learn-item-result" data-hm-result={right ? "right" : "wrong"}>
          {right ? <CheckIcon aria-hidden="true" /> : <CloseIcon aria-hidden="true" />}
          <span>{messages.t(right ? "player.correct" : "player.incorrect")}</span>
          {!right && (
            <span>
              {" "}
              {messages.t("multipleChoice.rightAnswer", {
                answer: question.choices[question.correct] ?? "",
              })}
            </span>
          )}
          {question.explanation && (
            <span className="hm-learn-explanation" {...language}>
              {" "}
              {question.explanation}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The multiple-choice block (ADR 0005): each question's choices are a group
 * of buttons with one Tab stop, chosen with Enter, Space or a tap, and
 * marked with `aria-pressed`. Once checked, each question says whether it
 * was right, with an icon and text, and shows the right answer.
 *
 * @public
 */
export const MultipleChoicePlayer = /* @__PURE__ */ definePlayerBlock<
  MultipleChoicePayload,
  MultipleChoiceAnswer
>(function MultipleChoicePlayer(props): ReactNode {
  const { exercise, answer, onAnswer, grade } = props;
  const questions = exercise.payload.questions;
  const selected = answer?.selected ?? questions.map(() => null);
  return (
    <div className="hm-learn-block">
      {questions.map((question, index) => (
        <Question
          // biome-ignore lint/suspicious/noArrayIndexKey: questions are fixed for an exercise
          key={index}
          question={question}
          number={index + 1}
          selected={selected[index] ?? null}
          right={grade ? grade.items[index] : undefined}
          onSelect={(choice) =>
            onAnswer({ selected: selected.map((current, i) => (i === index ? choice : current)) })
          }
          props={props}
        />
      ))}
    </div>
  );
});
