import { CheckIcon, CloseIcon } from "@hussmartinez/ui/react";
import type { ReactNode } from "react";
import { definePlayerBlock, type PlayerBlockProps } from "../player/player-block.js";
import { useRovingGroup } from "../player/roving.js";
import {
  type GapFillAnswer,
  type GapFillItem,
  type GapFillPayload,
  splitAtGap,
} from "./gap-fill.js";

type Props = PlayerBlockProps<GapFillPayload, GapFillAnswer>;

function Options({
  item,
  number,
  value,
  onChoose,
  props,
}: {
  readonly item: GapFillItem;
  readonly number: number;
  readonly value: string | null;
  readonly onChoose: (option: string) => void;
  readonly props: Props;
}): ReactNode {
  const { profile, messages, grade } = props;
  const options = item.options ?? [];
  const group = useRovingGroup(options.length);
  const checked = grade !== null;
  return (
    <fieldset className="hm-learn-choices" aria-label={messages.t("gapFill.options", { number })}>
      {options.map((option, index) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: options are fixed for an exercise
          key={index}
          type="button"
          className="hm-learn-choice"
          aria-pressed={value === option}
          aria-disabled={checked || undefined}
          onClick={() => {
            if (!checked) onChoose(option);
          }}
          {...group.item(index)}
        >
          <span lang={profile.code} dir={profile.direction}>
            {option}
          </span>
        </button>
      ))}
    </fieldset>
  );
}

function Item({
  item,
  number,
  value,
  right,
  onFill,
  props,
}: {
  readonly item: GapFillItem;
  readonly number: number;
  readonly value: string | null;
  readonly right: boolean | undefined;
  readonly onFill: (text: string) => void;
  readonly props: Props;
}): ReactNode {
  const { profile, messages, grade } = props;
  const [before, after] = splitAtGap(item.sentence) ?? [item.sentence, ""];
  const language = { lang: profile.code, dir: profile.direction };
  const label = messages.t("gapFill.gap", { number });
  return (
    <div className="hm-learn-question">
      <p className="hm-learn-sentence" {...language}>
        {before}
        {item.options ? (
          <span className="hm-learn-gap" data-hm-filled={value ? "" : undefined}>
            {value || "___"}
          </span>
        ) : (
          <input
            className="hm-learn-gap"
            aria-label={label}
            value={value ?? ""}
            readOnly={grade !== null}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(event) => onFill(event.currentTarget.value)}
            {...language}
          />
        )}
        {after}
      </p>
      {item.translation && <p className="hm-learn-translation">{item.translation}</p>}
      {item.options && (
        <Options item={item} number={number} value={value} onChoose={onFill} props={props} />
      )}
      {right !== undefined && (
        <p className="hm-learn-item-result" data-hm-result={right ? "right" : "wrong"}>
          {right ? <CheckIcon aria-hidden="true" /> : <CloseIcon aria-hidden="true" />}
          <span>{messages.t(right ? "player.correct" : "player.incorrect")}</span>
          {!right && (
            <span> {messages.t("gapFill.rightAnswer", { answer: item.answers[0] ?? "" })}</span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The gap-fill block (ADR 0005): each sentence's gap is a text field, or,
 * when the item has options, a group of choices with one Tab stop. Once
 * checked, each gap says whether it was right and shows an accepted answer.
 *
 * @public
 */
export const GapFillPlayer = /* @__PURE__ */ definePlayerBlock<GapFillPayload, GapFillAnswer>(
  function GapFillPlayer(props): ReactNode {
    const { exercise, answer, onAnswer, grade } = props;
    const items = exercise.payload.items;
    const filled = answer?.filled ?? items.map(() => null);
    return (
      <div className="hm-learn-block">
        {items.map((item, index) => (
          <Item
            // biome-ignore lint/suspicious/noArrayIndexKey: items are fixed for an exercise
            key={index}
            item={item}
            number={index + 1}
            value={filled[index] ?? null}
            right={grade ? grade.items[index] : undefined}
            onFill={(text) =>
              onAnswer({ filled: filled.map((current, i) => (i === index ? text : current)) })
            }
            props={props}
          />
        ))}
      </div>
    );
  },
);
