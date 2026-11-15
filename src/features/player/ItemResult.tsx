import { CheckIcon, CloseIcon } from "@hussmartinez/ui/react";
import type { ReactNode } from "react";
import type { LearnPlayerMessages } from "./player-messages.js";

/**
 * One checked item's result, as every block shows it (ADR 0005): the verdict
 * with an icon and text, never colour alone, on its own line, then, when the
 * answer was wrong, the right answer, and any explanation, each on a line of
 * its own.
 */
export function ItemResult({
  right,
  rightAnswer,
  explanation,
  messages,
}: {
  readonly right: boolean;
  /** The right answer's text, shown when the answer was wrong. */
  readonly rightAnswer: string;
  /** The content's explanation, in the interface's language. */
  readonly explanation?: string | undefined;
  readonly messages: LearnPlayerMessages;
}): ReactNode {
  return (
    <div className="hm-learn-item-result" data-hm-result={right ? "right" : "wrong"}>
      <p className="hm-learn-verdict">
        {right ? <CheckIcon aria-hidden="true" /> : <CloseIcon aria-hidden="true" />}
        <span>{messages.t(right ? "player.correct" : "player.incorrect")}</span>
      </p>
      {!right && <p className="hm-learn-right-answer">{rightAnswer}</p>}
      {explanation && <p className="hm-learn-explanation">{explanation}</p>}
    </div>
  );
}
