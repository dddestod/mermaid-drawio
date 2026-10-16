#!/usr/bin/env python3
"""Install dependencies in the containing or explicitly selected converter checkout."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', help='Converter checkout (default: containing checkout)')
    parser.add_argument('--skip-browser', action='store_true', help='Reuse an existing Playwright Chromium installation')
    args = parser.parse_args()
    node = shutil.which('node')
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if not node or not npm:
        raise SystemExit('Install Node.js 22.12 or later with npm, then rerun setup.')
    flags = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
    helper = Path(__file__).resolve().with_name('diagram.mjs')
    command = [node, str(helper), '--print-repo']
    if args.repo:
        command.extend(['--repo', args.repo])
    # Share discovery, environment and local configuration with the Node helper.
    checkout = Path(subprocess.check_output(command, text=True, **flags).strip())
    subprocess.run([npm, 'ci'], cwd=checkout, check=True, **flags)
    if not args.skip_browser:
        subprocess.run([node, str(checkout / 'node_modules' / 'playwright' / 'cli.js'),
                        'install', 'chromium'], cwd=checkout, check=True, **flags)
    print('Converter dependencies ready. Install Draw.io desktop separately; see SETUP.md.')

if __name__ == '__main__':
    main()
