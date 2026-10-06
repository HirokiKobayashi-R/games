#!/bin/zsh
# Only changes this process's working directory; no install or settings changes.
cd -- "${0:A:h}" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  print 'Python 3 is required. Nothing has been installed or changed.'
  read -k 1 '?Press any key to close.'
  exit 1
fi
exec python3 dojo.py
