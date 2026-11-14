/**
 * Where the player runs: each example, as a host builds and serves it, under
 * its own Content Security Policy.
 */
export const targets = [
  { name: "Vite", url: "http://localhost:4340/", serverRendered: false },
  { name: "Next.js", url: "http://localhost:4341/", serverRendered: true },
] as const;
