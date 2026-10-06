#!/bin/sh
set -eu
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 22+ is required. Install it yourself, then retry.' >&2
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
  echo 'Node.js 22+ is required. No runtime was installed or changed.' >&2
  exit 1
fi
if [ "$(uname -s)" != Darwin ]; then
  echo 'The separate-terminal launcher supports macOS only. Run client.js in your own terminal.' >&2
  exit 1
fi
exec node "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/terminal.mjs"
