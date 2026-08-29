#!/usr/bin/env bash
#
# build-safari.sh — scaffold / regenerate the Safari Web Extension wrapper
# (iOS + macOS) for the "Closed on Shabbat" extension so it can ship on the
# App Store.
#
# It does two things:
#   1. Runs the normal Chrome/Vite build to produce `dist/` (owned by another
#      agent — this script only calls `npm run build`, it does not change it).
#   2. Runs Apple's `safari-web-extension-converter` over `dist/` to generate a
#      native Xcode project under `apple/` that wraps the extension in a macOS
#      app and an iOS app.
#
# The generated Xcode project is a build artifact: it is regenerated from
# `dist/` every run and is git-ignored (see .gitignore). Commit only the source
# under `apple/` (this script, the docs, and any hand-maintained overrides) —
# never the generated `apple/GeneratedProject/` tree.
#
# This script is re-runnable: `--force` overwrites a previous generation.
#
# You do NOT need Xcode to read the docs, but you DO need macOS + Xcode to
# actually generate and build the wrapper. The guards below explain what to do
# when either is missing.

set -euo pipefail

# --- Config ---------------------------------------------------------------
APP_NAME="Closed on Shabbat"
BUNDLE_ID="io.eon.shabbatclosed"
# The converter emits the Xcode project into this directory. Kept under apple/
# in a dedicated subfolder so the hand-written docs in apple/ are never touched.
PROJECT_LOCATION="apple/GeneratedProject"
DIST_DIR="dist"

# Resolve repo root from this script's location so it works from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
fail()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Guard 1: must be macOS ----------------------------------------------
if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "Safari Web Extension conversion only runs on macOS.
       The Chrome build ('npm run build') works anywhere, but Apple's
       'safari-web-extension-converter' and Xcode are macOS-only. Run this on a
       Mac with Xcode installed. See apple/README.md for the full workflow."
fi

# --- Guard 2: Xcode + the converter must be present ----------------------
if ! xcode-select -p >/dev/null 2>&1; then
  fail "Xcode command-line tools are not selected.
       Install Xcode from the App Store, then run:
         sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
       (a bare Command Line Tools install is NOT enough — the converter ships
       inside the full Xcode.) See apple/README.md."
fi

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  fail "'safari-web-extension-converter' was not found.
       It ships with the full Xcode app (Xcode 12+). Install Xcode from the App
       Store and select it with 'sudo xcode-select --switch', then re-run.
       See apple/README.md."
fi

info "macOS + Xcode detected: $(xcrun safari-web-extension-converter --help >/dev/null 2>&1 && echo 'converter OK')"

# --- Step 1: build dist/ --------------------------------------------------
info "Building the Chrome/Vite extension ('npm run build') -> ${DIST_DIR}/"
npm run build

if [[ ! -f "${DIST_DIR}/manifest.json" ]]; then
  fail "Expected ${DIST_DIR}/manifest.json after the build, but it is missing.
       The converter needs a built, manifest-rooted extension in ${DIST_DIR}/."
fi

# --- Step 2: convert dist/ into an Xcode project --------------------------
# Default converter output is BOTH macOS and iOS targets (there is no --macos /
# --ios flag; use --ios-only / --macos-only to restrict). We want both.
#   --no-prompt  : don't wait for interactive confirmation (CI-friendly)
#   --force      : overwrite a previous generation, so this is re-runnable
#   --no-open    : don't launch Xcode (headless / agent-friendly)
info "Converting ${DIST_DIR}/ -> ${PROJECT_LOCATION}/ (macOS + iOS)"
mkdir -p "${PROJECT_LOCATION}"

xcrun safari-web-extension-converter "${DIST_DIR}" \
  --project-location "${PROJECT_LOCATION}" \
  --app-name "${APP_NAME}" \
  --bundle-identifier "${BUNDLE_ID}" \
  --copy-resources \
  --no-prompt \
  --force \
  --no-open

info "Done. Generated Xcode project is under ${PROJECT_LOCATION}/"
cat <<EOF

Next steps (see apple/README.md for the full walkthrough):
  1. open "${PROJECT_LOCATION}/${APP_NAME}/${APP_NAME}.xcodeproj"
  2. Set your Team + signing, then build & run the macOS and iOS schemes.
  3. Enable the extension: macOS Safari > Settings > Extensions; iOS
     Settings > Apps > Safari > Extensions.
  4. Archive each target and submit via App Store Connect
     (requires the \$99/yr Apple Developer Program).

Re-run this script any time dist/ changes to regenerate the wrapper.
EOF
