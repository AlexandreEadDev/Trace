#!/usr/bin/env node
/**
 * Configure Yarn Classic's `script-shell` for the current machine.
 *
 * Background
 * ----------
 * Yarn Classic (v1) on Windows spawns package scripts through `cmd.exe` after
 * prepending its temp shim directory and the user's Yarn bin directory to
 * `PATH`. When the user's home directory contains an ampersand (`&`) — e.g.
 * `C:\Users\Vicky&Alexandre❤️\...` — `cmd.exe` interprets the `&` inside those
 * `PATH` entries as a command separator, so every `yarn run <script>` fails
 * with "The system cannot find the path specified." before the script runs.
 *
 * The fix is to point Yarn at a shell that does not mis-parse `&`. Git Bash
 * (shipped with Git for Windows) is such a shell and is present on virtually
 * every Windows dev machine. On Linux/macOS the default shell already works,
 * so `script-shell` is left unset there.
 *
 * Where the setting is written
 * ----------------------------
 * This script writes `script-shell` to the *user's* Yarn config
 * (`~/.yarnrc`), NOT the project `.yarnrc`. Yarn Classic merges the home
 * config with the project config, so the setting still applies, but the
 * machine-specific absolute path is never committed to git. That keeps the
 * project `.yarnrc` portable: Vercel's Linux build sees no `script-shell` and
 * uses the default shell, while a Windows machine gets Git Bash automatically
 * after `yarn install` (this script runs from `postinstall`).
 *
 * The script is idempotent: it removes any previously written managed block
 * before appending the current one, and it removes the block entirely on
 * non-Windows platforms.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const homeYarnrcPath = join(homedir(), '.yarnrc')

const MARKER = '# --- script-shell (managed by scripts/setup-script-shell.mjs) ---'

// Candidate Git Bash locations on Windows, in order of preference.
const WINDOWS_BASH_CANDIDATES = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  process.env.ProgramFiles
    ? join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe')
    : null,
  process.env['ProgramFiles(x86)']
    ? join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe')
    : null,
].filter(Boolean)

function findWindowsBash() {
  for (const candidate of WINDOWS_BASH_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function stripManagedBlock(content) {
  // Remove a previously written managed block (marker + following script-shell
  // line) so re-running this script does not duplicate it.
  const lines = content.split(/\r?\n/)
  const result = []
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === MARKER) {
      // Skip the marker and the next non-empty line (the script-shell line).
      i += 1
      while (i < lines.length && lines[i].trim() === '') i += 1
      continue
    }
    result.push(lines[i])
  }
  return result.join('\n')
}

let content = existsSync(homeYarnrcPath)
  ? readFileSync(homeYarnrcPath, 'utf8')
  : ''
content = stripManagedBlock(content).replace(/\n{3,}/g, '\n\n').trimEnd()

let managedBlock = ''

if (process.platform === 'win32') {
  const bash = findWindowsBash()
  if (bash) {
    // Yarn passes the script command to the shell as a single argument; Git
    // Bash accepts `-c <command>` and handles `&` in paths correctly.
    managedBlock = `\n\n${MARKER}\nscript-shell "${bash.replace(/\\/g, '\\\\')}"\n`
    console.log(
      `[setup-script-shell] Windows detected — set script-shell to Git Bash: ${bash}`
    )
  } else {
    console.warn(
      '[setup-script-shell] Windows detected but Git Bash was not found. ' +
        'Install Git for Windows, or run scripts with `yarn node scripts/next.mjs <cmd>`.'
    )
  }
} else {
  console.log(
    '[setup-script-shell] Non-Windows platform — script-shell left unset (default shell is fine).'
  )
}

writeFileSync(homeYarnrcPath, `${content}${managedBlock}\n`)
