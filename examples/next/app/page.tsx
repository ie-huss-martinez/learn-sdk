/**
 * A Server Component, rendered for each request so it carries the request's
 * nonce. It renders the player from the client entry directly, which only
 * works if its "use client" directive survived the build (sdk-core ADR 0007),
 * and passes the content as plain data, as a host loading it on the server
 * would.
 */
import { LearnPlayer } from "@hussmartinez/learn-sdk/react";
import { connection } from "next/server";
import content from "../../thai-basics.json" with { type: "json" };

export default async function Page() {
  await connection();
  return (
    <main>
      <h1>The learn-sdk player, rendered on the server</h1>
      <LearnPlayer content={content} profile={{ code: "th", direction: "ltr" }} />
    </main>
  );
}
