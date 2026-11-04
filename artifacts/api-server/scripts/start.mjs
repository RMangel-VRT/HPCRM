// The renderer reads the optional build manifest itself, after explicit hints.
// Never relabel a build hint as an environment override or fail API startup on it.
await import("../dist/index.mjs");
