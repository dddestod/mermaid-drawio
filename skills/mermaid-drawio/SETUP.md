# Setup

Requirements: Node.js 22.12 or later with npm, Playwright Chromium, and
[Draw.io desktop](https://github.com/jgraph/drawio-desktop). The optional setup
helper requires Python 3.10 or later. Git is only needed to obtain a checkout;
source archives work too.

## Dependencies

From the repository root:

```sh
npm ci
npx --no-install playwright install chromium
```

Or, from any working directory:

```sh
python "<checkout>/skills/mermaid-drawio/scripts/setup.py"
```

Use `python3` where appropriate. The helper finds the containing checkout,
runs `npm ci` there, and installs Playwright Chromium. `--skip-browser` reuses
an installed browser. `npm ci` replaces that checkout's `node_modules`. Setup
never clones, switches Git revisions, or modifies converter source. Downloads
need network access during setup; conversion and export run locally.

The checkout's `package-lock.json` controls dependencies, including Mermaid
12.2.0 and esbuild. The helper uses whatever converter source the checkout
has, including local edits. When upgrading Mermaid or changing the converter,
run the repository checks and inspect fresh Draw.io exports.

## Install for an agent

Point your agent's skill discovery at this directory by linking (or copying)
it into the agent's skills directory. Review any existing skill at that
destination first.

- **Claude Code:** `~/.claude/skills/mermaid-drawio` for all projects, or
  `<project>/.claude/skills/mermaid-drawio` for one project.
- **Codex:** your configured skills directory, normally
  `~/.codex/skills/mermaid-drawio`. `agents/openai.yaml` holds its display
  metadata; other agents ignore it.

For macOS/Linux, with a destination that does not already exist (Claude Code
shown; substitute `.codex` for Codex):

```sh
mkdir -p "$HOME/.claude/skills"
ln -s "<checkout>/skills/mermaid-drawio" "$HOME/.claude/skills/mermaid-drawio"
```

For Windows, a directory junction avoids needing symlink privileges:

```powershell
New-Item -ItemType Directory -Force "$HOME/.claude/skills" | Out-Null
New-Item -ItemType Junction -Path "$HOME/.claude/skills/mermaid-drawio" -Target "<checkout>/skills/mermaid-drawio"
```

Replace `<checkout>` with an absolute checkout path. Links retain automatic
checkout discovery. A **copy outside the checkout** needs `--repo "<checkout>"`,
MERMAID_DRAWIO_REPO, or `config.local.json` beside SKILL.md:

```json
{"repo":"/path/to/mermaid-drawio"}
```

The copied Python setup helper accepts `--repo` and shares the Node helper's
environment/configuration discovery. No second converter is downloaded.
Reload your agent's skill discovery after installation.

## Discovery and configuration

Precedence is command line, environment variable, local configuration, then
automatic discovery. `--repo`, MERMAID_DRAWIO_REPO, or configuration select the
checkout; otherwise discovery starts at the helper's physical location and
walks up to the nearest containing mermaid-drawio checkout. It is independent
of the caller's working directory. Invalid explicit paths fail. `--print-repo`
prints the selected checkout without needing installed dependencies.

Draw.io is searched on PATH and in common Windows, macOS and Linux locations.
Use `--drawio PATH`, DRAWIO_EXE, or configuration for another location. For an
AppImage, supply the executable AppImage path. `--browser PATH`,
MERMAID_DRAWIO_BROWSER, or configuration overrides Playwright's Chromium.

All local configuration fields are optional:

```json
{"repo":"../../converter","drawio":"/path/to/drawio","browser":"/path/to/chromium"}
```

A relative configured `repo` resolves against the skill directory; relative
command-line/environment paths resolve against the caller's working directory.
Use absolute browser paths. Draw.io overrides accept an absolute path or a
name on PATH. `config.local.json` is ignored; do not distribute personal paths.

## Usage

From the repository root, faithful conversion (the default):

```sh
node skills/mermaid-drawio/scripts/diagram.mjs --input skills/mermaid-drawio/examples/workflow.mmd --out out/skill-faithful --work-dir out/skill-faithful-build
```

Explicit beautification:

```sh
node skills/mermaid-drawio/scripts/diagram.mjs --mode beautify --input skills/mermaid-drawio/examples/workflow.mmd --out out/skill-beautified --title "Assessment workflow" --style-map skills/mermaid-drawio/examples/styles.json --work-dir out/skill-beautified-build
```

Each writes `.drawio`, `.png` and `.mmd`. `--out` is a basename without an
extension; existing outputs require `--overwrite`. Diagnostic raw XML, SVG and
a report go in `--work-dir` (default `work/mermaid-drawio/<basename>`).

Faithful mode applies no visual initialization overrides or XML styling; its
XML is exactly the converter output. It uses Mermaid's defaults and source
frontmatter/directives, plus an optional `--config FILE` JSON initialization
object (for example `{"theme":"dark","flowchart":{"htmlLabels":false}}`).
Strict security, disabled automatic startup, error handling and a text-size
limit are enforced in both modes; they do not select visual styling. Faithful
means preserving the rendered SVG through the converter, subject to the
[known rendering differences](https://github.com/dddestod/mermaid-drawio#known-differences). Source alone
cannot recreate an external renderer's custom fonts or configuration.

Beautify mode applies rendering defaults for typography/spacing, then XML
palettes and strokes. A supplied `--config` overrides its rendering defaults.
`--preserve-colors` skips XML color replacement; it does not turn beautify into
faithful mode. Titles, palette maps, spacing and font options require
`--mode beautify`, preventing accidental restyling of ordinary conversions.
Use `--help` for all options.

After editing XML manually, export that file without regenerating it:

```sh
node skills/mermaid-drawio/scripts/diagram.mjs --render-only out/skill-beautified.drawio --png out/skill-beautified.png --overwrite
```

Inspect the final PNG and deliver it with the editable `.drawio` as described
in [SKILL.md](SKILL.md).

## Platforms and checks

The complete workflow is tested on **Windows**. macOS/Linux executable discovery
is implemented but **untested on those platforms**. Draw.io is an Electron app
and can need a display server on Linux. On a headless host, install Xvfb and the
required system libraries, then run under `xvfb-run -a`. Playwright may also
require Linux system dependencies. Fonts affect wrapping; beautify's default
stack is Arial, Helvetica, sans-serif. Faithful mode uses Mermaid/source config.

Export always passes `--force-device-scale-factor=1` to prevent PNG cropping
caused by Windows display scaling, and hides the Windows subprocess window.

From the repository root:

```sh
npm run check
npm test
npm run test:skill          # discovery, CLI protections, both modes in Chromium
npm run test:skill:export   # full CLI workflow; requires real Draw.io desktop
```

The export checks cover both modes, PNG validity, overwrite protection, manual
XML rerendering and a relocated source checkout with spaces in its path. Inspect
the generated example PNGs visually as well; automated export success does
not establish layout quality.

## Distribution and license

The skill, scripts and examples use the repository's [MIT license](LICENSE).
For a separate copy, include this directory's SKILL.md, SETUP.md, README.md,
agents/, scripts/, examples/, and LICENSE. Exclude
config.local.json, work/, node_modules/, and Python caches. A separate copy
still needs access to a converter checkout and its installed dependencies.
