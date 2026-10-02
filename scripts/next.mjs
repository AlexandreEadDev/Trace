#!/usr/bin/env node
/**
 * Cross-platform Next.js CLI launcher.
 *
 * Why this exists:
 *   Yarn Classic (v1) on Windows creates temporary shim executables (e.g.
 *   `node.cmd`) inside `%TEMP%\yarn--<id>\` and prepends that directory to
 *   `PATH` before spawning a package script through `cmd.exe`. When the user's
 *   home directory contains an ampersand (`&`) — e.g.
 *   `C:\Users\Vicky&Alexandre❤️\...` — the shim path itself contains `&`, which
 *   `cmd.exe` interprets as a command separator. The spawn then fails with
 *   "The system cannot find the path specified." This breaks every
 *   `yarn run <script>` that invokes a binary resolved via `PATH` (such as
 *   `node`), even though `yarn node` and `yarn exec` work when run directly.
 *
 *   The fix is twofold:
 *     1. The package scripts invoke Node via `"%npm_node_execpath%"` (the real
 *        node.exe path that Yarn exports) instead of the bare `node` command.
 *        Quoting the path makes `cmd.exe` treat the `&` literally, bypassing
 *        the broken temp shim entirely.
 *     2. This launcher resolves and spawns the Next.js binary via Node's
 *        `child_process` with `shell: false`, so the `&` in any path is never
 *        re-parsed by a shell.
 *
 * Usage:
 *   "%npm_node_execpath%" scripts/next.mjs dev
 *   "%npm_node_execpath%" scripts/next.mjs build
 *   "%npm_node_execpath%" scripts/next.mjs start
 *   "%npm_node_execpath%" scripts/next.mjs lint
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))

// Resolve the Next.js CLI entry point from the installed package.
const nextPkg = require.resolve('next/package.json')
const nextBin = join(dirname(nextPkg), 'dist', 'bin', 'next')

const args = process.argv.slice(2)

const child = spawn(process.execPath, [nextBin, ...args], {
  cwd: projectRoot,
  stdio: 'inherit',
  // `shell: false` (default) avoids cmd.exe re-parsing the `&` in the path.
  shell: false,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})

child.on('error', (err) => {
  console.error('[next.mjs] Failed to launch Next.js:', err)
  process.exit(1)
})
