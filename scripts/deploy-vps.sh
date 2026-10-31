#!/bin/sh
# Build the app for the root of kestrel.allmymind.org (the default base, /) and deploy it to /var/www/kestrel on the VPS,
# keeping the last complete tree as /var/www/kestrel.prev (millwright's contrib/site-deploy; docs/hosting.md).
# GitHub Pages at /spell-forge/ serves only the moved page (`npm run build:moved`, .github/workflows/deploy.yml).
set -eu

HOST="${KESTREL_HOST:-root@allmymind.org}"
DIR="${KESTREL_DIR:-/var/www/kestrel}"
SITE_DEPLOY="${SITE_DEPLOY:-$HOME/millwright/contrib/site-deploy}"

npm run build

# A root build names its files from /; a page that still names /spell-forge/ would 404 on the VPS.
if grep -q '/spell-forge/' dist/index.html; then
	echo "deploy-vps: dist/index.html names /spell-forge/; the build was made for /spell-forge/ (SF_BASE is set)" >&2
	exit 1
fi

"$SITE_DEPLOY" dist "$HOST" "$DIR"
