import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import { build } from "vite";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Proves the core grades in the Workers runtime, as hosts on Cloudflare do
 * (ADR 0001): the package is built, bundled into a worker with sdk-core, and
 * served by workerd, the runtime's open-source core, from the pinned
 * `workerd` dev dependency.
 */

const require = createRequire(import.meta.url);
const workerd = require("workerd") as { default: string; compatibilityDate: string };

const WORKER = `
import { createExerciseTypes, defineExerciseType, gradeAnswer, parseContent } from "./dist/index.js";

const BROWSER_GLOBALS = ["window", "document", "localStorage", "sessionStorage", "customElements", "HTMLElement", "speechSynthesis"];

const yesNo = defineExerciseType({
  type: "yes-no",
  validate(payload, context) {
    const fields = context.fields(payload, ["answer"]);
    const answer = fields && context.at("answer").yesNo(fields.answer);
    return typeof answer === "boolean" ? { answer } : undefined;
  },
  validateAnswer: (answer, _payload, context) => context.yesNo(answer),
  grade: (payload, answer) => ({ score: payload.answer === answer ? 1 : 0, max: 1, items: [payload.answer === answer] }),
});

export default {
  async fetch() {
    const types = createExerciseTypes([yesNo]);
    const content = parseContent(
      JSON.stringify({ format: "hm-learn-content", version: 1, exercises: [{ id: "q", type: "yes-no", payload: { answer: true } }] }),
      { types },
    );
    const exercise = content.exercises[0];
    let invalid = null;
    try {
      gradeAnswer(exercise, "yes", { types });
    } catch (error) {
      invalid = { name: error.name, code: error.code };
    }
    return Response.json({
      browserGlobals: BROWSER_GLOBALS.filter((name) => name in globalThis),
      grade: gradeAnswer(exercise, true, { types }),
      invalid,
    });
  },
};
`;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port")),
      );
    });
  });
}

const workspace = (async () => {
  const parent = join(process.cwd(), "temp");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "workerd-test-"));
  // The package, built with its real config.
  await build({
    configFile: new URL("../vite.config.ts", import.meta.url).pathname,
    logLevel: "silent",
    build: { outDir: join(directory, "dist"), emptyOutDir: true },
  });
  // A worker importing it, bundled with sdk-core into one module.
  await writeFile(join(directory, "worker-source.js"), WORKER);
  await build({
    configFile: false,
    logLevel: "silent",
    build: {
      lib: {
        entry: join(directory, "worker-source.js"),
        formats: ["es"],
        fileName: () => "worker.js",
      },
      outDir: join(directory, "bundle"),
      emptyOutDir: true,
      minify: false,
      target: "es2022",
    },
  });
  return directory;
})();

afterAll(async () => {
  await rm(await workspace, { recursive: true, force: true });
});

describe("grading in the Workers runtime", () => {
  it("parses content and grades answers in workerd, with no browser global (ADR 0001)", async () => {
    const directory = await workspace;
    const port = await freePort();
    await writeFile(
      join(directory, "config.capnp"),
      `using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [ (name = "main", worker = .worker) ],
  sockets = [ (name = "http", address = "127.0.0.1:${port}", http = (), service = "main") ],
);
const worker :Workerd.Worker = (
  modules = [ (name = "worker", esModule = embed "bundle/worker.js") ],
  compatibilityDate = "${workerd.compatibilityDate}",
);
`,
    );
    const server = spawn(workerd.default, ["serve", join(directory, "config.capnp")], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    server.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    try {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 100 && !response; attempt++) {
        try {
          response = await fetch(`http://127.0.0.1:${port}/`);
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      expect(response, stderr).toBeDefined();
      expect(response?.status, stderr).toBe(200);
      expect(await response?.json()).toEqual({
        browserGlobals: [],
        grade: { score: 1, max: 1, items: [true] },
        invalid: { name: "LearnError", code: "INVALID_ANSWER" },
      });
    } finally {
      server.kill();
    }
  }, 60_000);
});
