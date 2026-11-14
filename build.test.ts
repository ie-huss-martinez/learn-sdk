import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build, type Rolldown } from "vite";
import { afterAll, describe, expect, it } from "vitest";
import { externalPackages } from "./vite.config.js";

/**
 * Builds the package in memory with its real Vite config, so these checks see
 * exactly what dist/ would contain without writing to it.
 */
async function buildInMemory(): Promise<Array<Rolldown.OutputChunk | Rolldown.OutputAsset>> {
  const result = await build({
    configFile: new URL("vite.config.ts", import.meta.url).pathname,
    logLevel: "silent",
    build: { write: false },
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap((output) => ("output" in output ? output.output : []));
}

const files = await buildInMemory();

function chunk(fileName: string): Rolldown.OutputChunk {
  const found = files.find((file) => file.fileName === fileName);
  if (found?.type !== "chunk") {
    throw new Error(`${fileName} wasn't built as a JavaScript chunk`);
  }
  return found;
}

describe("the built package", () => {
  it('starts the React entry with "use client" (ADR 0007)', () => {
    expect(chunk("react.js").code).toMatch(/^"use client";\n/);
  });

  it('keeps "use client" out of the core and element entries (ADR 0004)', () => {
    expect(chunk("index.js").code).not.toContain("use client");
    expect(chunk("element.js").code).not.toContain("use client");
  });

  it("emits the stylesheet as its own file", () => {
    const styles = files.find((file) => file.fileName === "styles.css");
    expect(styles?.type).toBe("asset");
  });

  it("imports sdk-core and React instead of bundling them", () => {
    expect(externalPackages).toEqual(
      expect.arrayContaining(["@hussmartinez/sdk-core", "react", "react-dom"]),
    );
    expect(chunk("index.js").code).toContain('from "@hussmartinez/sdk-core"');
    for (const file of files) {
      if (file.type === "chunk") {
        // Bundled React or sdk-core would bring their own copies of these, and
        // a page with several SDKs would load sdk-core more than once.
        expect(file.code, file.fileName).not.toContain("react.transitional.element");
        expect(file.code, file.fileName).not.toContain("class SdkError");
      }
    }
  });

  it("depends on no test framework, not even in ./testing", () => {
    expect(chunk("testing.js").code.length).toBeGreaterThan(0);
    for (const file of files) {
      if (file.type === "chunk") {
        expect(
          file.imports.filter((name) => /^(?:vitest|jest|@jest\/|node:test)/.test(name)),
          file.fileName,
        ).toEqual([]);
      }
    }
  });

  it("uses the production JSX runtime and leaks no local paths", () => {
    const code = files.flatMap((file) => (file.type === "chunk" ? [file.code] : [])).join("\n");
    expect(code).not.toContain("jsx-dev-runtime");
    expect(code).not.toContain(process.cwd());
  });

  it("never imports CSS from JavaScript (ADR 0004)", () => {
    const javascript = files.filter((file) => file.type === "chunk");
    expect(javascript.length).toBeGreaterThan(0);
    for (const file of javascript) {
      expect(file.imports.filter((name) => name.endsWith(".css"))).toEqual([]);
      expect(file.code).not.toMatch(/import\s*["'][^"']+\.css["']/);
    }
  });
});

/**
 * Builds the package to a temporary folder inside the repository, so the
 * built files resolve their external imports from its node_modules, as they
 * would in an application.
 */
const temporaryBuild = (async () => {
  const parent = join(process.cwd(), "temp");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "build-test-"));
  await build({
    configFile: new URL("vite.config.ts", import.meta.url).pathname,
    logLevel: "silent",
    build: { outDir: directory, emptyOutDir: true },
  });
  return directory;
})();

afterAll(async () => {
  await rm(await temporaryBuild, { recursive: true, force: true });
});

describe("importing on a server", () => {
  // The unit project runs in Node, without a DOM, as a server would.
  it.each(["index.js", "element.js"])(
    "imports %s without touching browser APIs (ADR 0004, ADR 0007)",
    async (entry) => {
      expect(globalThis).not.toHaveProperty("window");
      expect(globalThis).not.toHaveProperty("customElements");
      const url = pathToFileURL(join(await temporaryBuild, entry)).href;
      await expect(import(url)).resolves.toBeTypeOf("object");
    },
  );
});

describe("grading on a server", () => {
  // Browser globals the core must never need. Some Node versions define a few
  // of them (Node 25 and later have localStorage), so instead of assuming
  // they're absent, the test replaces each with a getter that records the
  // access and throws, for as long as the core is imported and used.
  const BROWSER_GLOBALS = [
    "window",
    "document",
    "navigator",
    "localStorage",
    "sessionStorage",
    "customElements",
    "HTMLElement",
    "speechSynthesis",
  ];

  it("parses content and grades an answer with the built core, touching no browser global (ADR 0001)", async () => {
    const touched: string[] = [];
    const saved = new Map<string, PropertyDescriptor | undefined>();
    for (const name of BROWSER_GLOBALS) {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() {
          touched.push(name);
          throw new Error(`The core touched ${name}`);
        },
      });
    }
    try {
      // A fresh copy, so evaluating the module counts as well as calling it.
      const url = `${pathToFileURL(join(await temporaryBuild, "index.js")).href}?server-grading`;
      const core = (await import(url)) as typeof import("./src/index.js");
      const yesNo = core.defineExerciseType<{ answer: boolean }, boolean>({
        type: "yes-no",
        validate(payload, context) {
          const fields = context.fields(payload, ["answer"]);
          const answer = fields && context.at("answer").yesNo(fields.answer);
          return answer === undefined || answer === null ? undefined : { answer };
        },
        validateAnswer: (answer, _payload, context) => context.yesNo(answer),
        grade: (payload, answer) => ({
          score: payload.answer === answer ? 1 : 0,
          max: 1,
          items: [payload.answer === answer],
        }),
      });
      const types = core.createExerciseTypes([yesNo]);
      const content = core.parseContent(
        JSON.stringify({
          format: "hm-learn-content",
          version: 1,
          exercises: [{ id: "q", type: "yes-no", payload: { answer: true } }],
        }),
        { types },
      );
      const [exercise] = content.exercises;
      if (!exercise) {
        throw new Error("the content has one exercise");
      }
      expect(core.gradeAnswer(exercise, true, { types })).toEqual({
        score: 1,
        max: 1,
        items: [true],
      });
      expect(() => core.gradeAnswer(exercise, "yes", { types })).toThrow(
        expect.objectContaining({ name: "LearnError", code: "INVALID_ANSWER" }),
      );
    } finally {
      for (const [name, descriptor] of saved) {
        if (descriptor) {
          Object.defineProperty(globalThis, name, descriptor);
        } else {
          delete (globalThis as Record<string, unknown>)[name];
        }
      }
    }
    expect(touched).toEqual([]);
  });
});

describe("ts-fsrs, only for hosts that schedule", () => {
  /** Bundles a consumer of the built package, as a host's bundler would. */
  async function bundle(source: string): Promise<string> {
    const directory = await temporaryBuild;
    const entry = join(
      directory,
      `consumer-${source.length}-${Math.random().toString(36).slice(2)}.js`,
    );
    await writeFile(entry, source);
    const result = await build({
      configFile: false,
      logLevel: "silent",
      build: {
        write: false,
        minify: true,
        lib: { entry, formats: ["es"], fileName: () => "consumer.js" },
        rollupOptions: { external: [] },
      },
    });
    const outputs = Array.isArray(result) ? result : [result];
    return outputs
      .flatMap((output) => ("output" in output ? output.output : []))
      .flatMap((file) => (file.type === "chunk" ? [file.code] : []))
      .join("\n");
  }

  it("keeps ts-fsrs an import, never bundled into the package", () => {
    expect(externalPackages).toContain("ts-fsrs");
    for (const file of files) {
      if (file.type === "chunk") {
        expect(file.code, file.fileName).not.toContain("FSRS7Algorithm");
      }
    }
  });

  it("drops ts-fsrs from a host that doesn't use the FSRS adapter, and keeps it for one that does", async () => {
    const coreOnly = await bundle(
      'import { parseContent, createExerciseTypes, multipleChoice } from "./index.js";\nexport const run = (input) => parseContent(input, { types: createExerciseTypes([multipleChoice]) });\n',
    );
    const scheduling = await bundle(
      'import { createFsrsScheduler } from "./index.js";\nexport const scheduler = createFsrsScheduler();\n',
    );
    expect(coreOnly).not.toContain("stabilityFast");
    expect(scheduling).toContain("stabilityFast");
  });
});
