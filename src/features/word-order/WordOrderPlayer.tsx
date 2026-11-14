import { CheckIcon, CloseIcon } from "@hussmartinez/ui/react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { definePlayerBlock, type PlayerBlockProps } from "../player/player-block.js";
import { useRovingGroup } from "../player/roving.js";
import type { WordOrderAnswer, WordOrderItem, WordOrderPayload } from "./word-order.js";

type Props = PlayerBlockProps<WordOrderPayload, WordOrderAnswer>;

/** A string's 32-bit FNV-1a hash, for a stable order. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/**
 * The bank's order: the tiles shuffled the same way on every render, on a
 * server and in every browser, and never in the right order, which content
 * stores the tiles in.
 */
export function bankOrder(seed: string, count: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index).sort(
    (a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`) || a - b,
  );
  return count > 1 && order.every((position, index) => position === index)
    ? [...order.slice(1), order[0] as number]
    : order;
}

function Item({
  item,
  seed,
  number,
  order,
  right,
  onOrder,
  props,
}: {
  readonly item: WordOrderItem;
  readonly seed: string;
  readonly number: number;
  /** The tiles placed so far, by position in `item.tiles`. */
  readonly order: readonly number[];
  readonly right: boolean | undefined;
  readonly onOrder: (order: readonly number[]) => void;
  readonly props: Props;
}): ReactNode {
  const { profile, messages, grade, announce } = props;
  const checked = grade !== null;
  const [bank] = useState(() => bankOrder(seed, item.tiles.length));
  const placedButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const bankButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusNext, setFocusNext] = useState<{
    readonly where: "placed" | "bank";
    readonly index: number;
  } | null>(null);
  const language = { lang: profile.code, dir: profile.direction };
  const count = item.tiles.length;
  const text = (tile: number) => item.tiles[tile] ?? "";

  useEffect(() => {
    if (!focusNext) return;
    (focusNext.where === "placed" ? placedButtons : bankButtons).current[focusNext.index]?.focus();
    setFocusNext(null);
  }, [focusNext]);

  const move = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (checked || !event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
        return false;
      }
      // In a right-to-left language, ← moves a tile towards the end.
      const forward = (event.key === "ArrowRight") === (profile.direction !== "rtl");
      const target = index + (forward ? 1 : -1);
      if (target < 0 || target >= order.length) return true;
      const next = [...order];
      [next[index], next[target]] = [next[target] as number, next[index] as number];
      onOrder(next);
      setFocusNext({ where: "placed", index: target });
      announce(
        messages.t("wordOrder.moved", {
          tile: item.tiles[next[target] as number] ?? "",
          position: target + 1,
          count,
        }),
      );
      return true;
    },
    [checked, order, onOrder, announce, messages, profile.direction, count, item.tiles],
  );
  const placedGroup = useRovingGroup(order.length, move);
  const bankGroup = useRovingGroup(count);

  return (
    <div className="hm-learn-question">
      {item.translation && <p className="hm-learn-translation">{item.translation}</p>}
      <fieldset
        className="hm-learn-tiles hm-learn-tiles--placed"
        aria-label={messages.t("wordOrder.answer", { number })}
        {...language}
      >
        {order.map((tile, index) => {
          const { ref, ...rest } = placedGroup.item(index);
          return (
            <button
              key={tile}
              type="button"
              className="hm-learn-tile"
              aria-disabled={checked || undefined}
              ref={(element) => {
                ref(element);
                placedButtons.current[index] = element;
              }}
              onClick={() => {
                if (checked) return;
                onOrder(order.filter((_, i) => i !== index));
                // The tile leaves the sentence: focus goes to it in the bank.
                setFocusNext({ where: "bank", index: bank.indexOf(tile) });
                announce(messages.t("wordOrder.returned", { tile: text(tile) }));
              }}
              {...rest}
            >
              {text(tile)}
            </button>
          );
        })}
      </fieldset>
      <fieldset
        className="hm-learn-tiles"
        aria-label={messages.t("wordOrder.bank", { number })}
        {...language}
      >
        {bank.map((tile, index) => {
          const placed = order.includes(tile);
          const { ref, ...rest } = bankGroup.item(index);
          return (
            <button
              key={tile}
              type="button"
              className="hm-learn-tile"
              aria-disabled={checked || placed || undefined}
              data-hm-placed={placed ? "" : undefined}
              ref={(element) => {
                ref(element);
                bankButtons.current[index] = element;
              }}
              onClick={() => {
                if (checked || placed) return;
                const next = [...order, tile];
                onOrder(next);
                announce(
                  messages.t("wordOrder.placed", {
                    tile: text(tile),
                    position: next.length,
                    count,
                  }),
                );
              }}
              {...rest}
            >
              {text(tile)}
            </button>
          );
        })}
      </fieldset>
      {right !== undefined && (
        <p className="hm-learn-item-result" data-hm-result={right ? "right" : "wrong"}>
          {right ? <CheckIcon aria-hidden="true" /> : <CloseIcon aria-hidden="true" />}
          <span>{messages.t(right ? "player.correct" : "player.incorrect")}</span>
          {!right && (
            <span> {messages.t("wordOrder.rightAnswer", { answer: item.tiles.join(" ") })}</span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The word-order block (ADR 0005): choosing a tile in the bank places it at
 * the end of the sentence, and choosing a placed tile returns it. Alt with
 * ← or → moves a placed tile, as the keyboard alternative to dragging, and
 * every move is announced. The bank shows the tiles in a stable shuffled
 * order. Once checked, each sentence says whether it was right.
 *
 * @public
 */
export const WordOrderPlayer = /* @__PURE__ */ definePlayerBlock<WordOrderPayload, WordOrderAnswer>(
  function WordOrderPlayer(props): ReactNode {
    const { exercise, answer, onAnswer, grade, messages } = props;
    const items = exercise.payload.items;
    // Partly placed sentences aren't answers yet, so the block keeps them;
    // the answer holds each complete sentence, and null for the others.
    const [orders, setOrders] = useState<readonly (readonly number[])[]>(() =>
      items.map((_, index) => answer?.orders[index] ?? []),
    );
    // A retry empties the answer: start the sentences again too.
    useEffect(() => {
      if (answer === undefined) {
        setOrders((current) =>
          current.every((order) => order.length === 0) ? current : items.map(() => []),
        );
      }
    }, [answer, items]);
    return (
      <div className="hm-learn-block">
        <p className="hm-learn-hint">{messages.t("wordOrder.hint")}</p>
        {items.map((item, index) => (
          <Item
            // biome-ignore lint/suspicious/noArrayIndexKey: items are fixed for an exercise
            key={index}
            item={item}
            seed={`${exercise.id}:${index}`}
            number={index + 1}
            order={orders[index] ?? []}
            right={grade ? grade.items[index] : undefined}
            onOrder={(order) => {
              const next = orders.map((current, i) => (i === index ? order : current));
              setOrders(next);
              onAnswer({
                orders: next.map((placed, i) =>
                  placed.length === (items[i]?.tiles.length ?? -1) ? [...placed] : null,
                ),
              });
            }}
            props={props}
          />
        ))}
      </div>
    );
  },
);
