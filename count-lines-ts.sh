#!/usr/bin/env bash
# How many lines of TypeScript is this project? (git-tracked .ts files only)
# Run from anywhere; keeps us honest about scope creep.
set -euo pipefail
cd "$(dirname "$0")"
# --cached + --others --exclude-standard = tracked AND new files, minus anything
# gitignored (node_modules etc). So uncommitted work counts too.
git ls-files --cached --others --exclude-standard -- '*.ts' | xargs wc -l | sort -rn
