/**
 * Module declaration for Vite/WXT `?raw` imports.
 *
 * The prompt-builder loads the synced prompt templates as raw text via
 * `import foo from "./prompts/foo.prompt.md?raw"`. Vite handles this at
 * build time; we declare the wildcard module here so `tsc --noEmit`
 * accepts the imports.
 */
declare module "*.md?raw" {
  const content: string;
  export default content;
}
