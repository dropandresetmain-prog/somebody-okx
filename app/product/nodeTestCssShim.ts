/**
 * Node test-runtime shim — not a bundler concern.
 *
 * Next.js's build (webpack/Turbopack) resolves `import "*.css"` side-effect
 * imports through its own asset pipeline before any component code runs, so
 * this module is inert there. It exists only so this component tree can
 * also be exercised directly by `node --test` (via tsx), which loads .tsx
 * files through Node's native CommonJS `require()` and has no CSS loader of
 * its own — without this, requiring a `.css` file throws a SyntaxError
 * (CSS is not valid JS). Registering a no-op handler for the `.css`
 * extension lets the side-effect import resolve to an empty module under
 * plain Node execution.
 *
 * Must be imported BEFORE the `.css` import it is guarding — sibling
 * `import` statements in the same module evaluate in textual order.
 */
if (typeof require !== "undefined" && typeof require.extensions === "object" && !require.extensions[".css"]) {
  require.extensions[".css"] = (mod) => {
    mod.exports = {};
  };
}

export {};
