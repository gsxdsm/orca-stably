#!/usr/bin/env node
// Bundles the ESM Ink/React TUI into a single ESM module the tsc-built (CJS)
// CLI loads via dynamic import(). Ink/yoga use top-level await, so the output
// must stay ESM; bundling avoids migrating the whole CLI bin off CommonJS.
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// Ink statically imports react-devtools-core from its devtools path, but only
// reaches that code under opt-in DEV mode the CLI never enables. The package
// isn't installed, so stub it with a no-op to keep it out of the bundle.
const stubReactDevtools = {
  name: 'stub-react-devtools-core',
  setup(buildApi) {
    buildApi.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-core',
      namespace: 'stub-react-devtools-core'
    }))
    buildApi.onLoad({ filter: /.*/, namespace: 'stub-react-devtools-core' }, () => ({
      contents: 'export default { connectToDevTools() {} }',
      loader: 'js'
    }))
  }
}

async function main() {
  await build({
    plugins: [stubReactDevtools],
    entryPoints: [path.join(projectDir, 'src/cli/tui/tui-entry.tsx')],
    outfile: path.join(projectDir, 'out/cli/tui/tui-bundle.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    // Why: Ink/yoga rely on top-level await, so the bundle must stay ESM; the
    // CommonJS handler loads it through dynamic import().
    format: 'esm',
    // Classic JSX transform (React.createElement) — matches the tsconfig.tui
    // typecheck and keeps the explicit React import meaningful across tools.
    jsx: 'transform',
    // Why: some bundled CJS deps (e.g. signal-exit) call require() for Node
    // built-ins; ESM output has no require, so provide one via createRequire.
    banner: {
      js: "import { createRequire as __cliTuiCreateRequire } from 'module'; const require = __cliTuiCreateRequire(import.meta.url);"
    },
    logLevel: 'info'
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
