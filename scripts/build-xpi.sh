#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
NAME="reading-checkpoint"
VERSION="$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "${ROOT_DIR}/manifest.json" | head -n1)"
OUT_FILE="${DIST_DIR}/${NAME}-${VERSION}.xpi"

mkdir -p "${DIST_DIR}"
rm -f "${OUT_FILE}"

cd "${ROOT_DIR}"

zip -r "${OUT_FILE}" \
  manifest.json \
  background.js \
  content-script.js \
  README.md \
  PRIVACY.md \
  assets \
  -x "backup/*" "dist/*" ".git/*"

echo "Created ${OUT_FILE}"
