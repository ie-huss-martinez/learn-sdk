import "@hussmartinez/ui/styles.css";
import "@hussmartinez/learn-sdk/styles.css";
import "./example.css";
import { LearnPlayer } from "@hussmartinez/learn-sdk/react";
import { createRoot } from "react-dom/client";
import content from "../../thai-basics.json" with { type: "json" };

/**
 * The player, as a host renders it: ui's stylesheet first, then the SDK's
 * (sdk-core ADR 0036), with the content in Thai.
 *
 * `?content=broken` gives it content of a later format version instead, so
 * the screenshot tests can show how the player says it can't open content.
 */
const broken = new URLSearchParams(location.search).get("content") === "broken";
const element = document.querySelector<HTMLElement>("#player");
if (element) {
  createRoot(element).render(
    <LearnPlayer
      content={broken ? { ...content, version: 2 } : content}
      profile={{ code: "th", direction: "ltr" }}
    />,
  );
}
