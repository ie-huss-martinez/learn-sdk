/**
 * Headless core of the learn SDK: the content model, exercise types and their
 * grading, sessions, ports and errors.
 *
 * @remarks
 * This entry is server-safe: it has no React and touches no DOM on import, so
 * Server Components, Node and Workers runtimes can import it, and a host can
 * grade on its server with the same code the browser uses (ADR 0004, ADR 0007).
 * The core arrives in the next releases.
 *
 * @packageDocumentation
 */

export {};
