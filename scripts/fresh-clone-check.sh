#!/usr/bin/env bash
# Follow the README literally in a clean folder. Usage: bash scripts/fresh-clone-check.sh [repo-url-or-path]
set -euo pipefail
SRC="${1:-https://github.com/omni6nt/trustpal-agent}"
DIR="$(mktemp -d)"
echo "Node: $(node --version)  (needs 22.22.2 or newer)"
node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&(b<22||(b===22&&c<2)))){console.error("Node too old");process.exit(1)}'
git clone --depth 1 "$SRC" "$DIR/trustpal" && cd "$DIR/trustpal"
echo "Commit: $(git rev-parse HEAD)"
npm install --no-audit --no-fund
if npm test > "$DIR/test.log" 2>&1; then
  echo "tests: PASS"; grep -E "(pass|fail) [0-9]+" "$DIR/test.log" | tail -4
else
  echo "tests: FAILED"; tail -40 "$DIR/test.log"; exit 1
fi
PORT=3555 node --experimental-strip-types src/web.ts > "$DIR/web.log" 2>&1 &
PID=$!; sleep 4
curl -sf http://localhost:3555/app.html > /dev/null && echo "web: app.html served" || { echo "web: FAILED"; kill $PID; exit 1; }
kill $PID
echo "Fresh clone OK in $DIR/trustpal"
