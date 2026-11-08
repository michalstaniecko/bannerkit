#!/usr/bin/env node
// Thin launcher: registers tsx (resolved from this package, not the caller's cwd)
// and hands argv to the CLI adapter. All behaviour lives in src/cli and src/ops.
import { register } from 'tsx/esm/api'

register()
const { main } = await import('../src/cli/main.ts')
process.exitCode = await main(process.argv.slice(2), {
  env: process.env,
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
})
