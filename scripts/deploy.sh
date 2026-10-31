#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${S3_BUCKET:=daw-looplicator}"
: "${CF_DIST_ID:=E1NUUOP2O6M9IB}"
VERSION=$(node -p "JSON.parse(require('fs').readFileSync('web/package.json')).version")
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Expected a stable semantic version' >&2; exit 1; }
ROOT_VERSION=$(node -p "JSON.parse(require('fs').readFileSync('package.json')).version")
[[ "$ROOT_VERSION" == "$VERSION" ]] || { echo 'Root and web versions must match' >&2; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo 'Commit tracked changes before deploying' >&2; exit 1; }
EXISTING=$(aws s3api list-objects-v2 --bucket "$S3_BUCKET" --prefix "v${VERSION}/" --max-keys 1 --query KeyCount --output text)
[[ "$EXISTING" == 0 ]] || { echo "Release v${VERSION} already exists; choose a new version" >&2; exit 1; }

npm run build
npm run build --workspace web -- --base="/v${VERSION}/" --outDir release-dist

# Upload the self-contained archive first. Never delete or overwrite older releases.
aws s3 sync web/release-dist/ "s3://${S3_BUCKET}/v${VERSION}/" --exclude '.gitignore' --cache-control no-cache
# Keep legacy root assets too: old archived HTML may still reference them.
# Publish entry HTML last so its assets are available before users see the release.
aws s3 sync web/dist/ "s3://${S3_BUCKET}/" --exclude index.html --exclude '.gitignore' --cache-control no-cache
aws s3 cp web/dist/index.html "s3://${S3_BUCKET}/index.html" --content-type text/html --cache-control no-cache
INVALIDATION=$(aws cloudfront create-invalidation --distribution-id "$CF_DIST_ID" --paths '/*' --query Invalidation.Id --output text)
aws cloudfront wait invalidation-completed --distribution-id "$CF_DIST_ID" --id "$INVALIDATION"
echo "Published v${VERSION}: https://daw.looplicator.com/"
echo "Archive: https://daw.looplicator.com/v${VERSION}/"
