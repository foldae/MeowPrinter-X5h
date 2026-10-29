#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

MODEL=backend/src/meowprinter/protocol/models.py
[ -f "$MODEL" ] || { echo "Run this script from the MeowPrinter project root" >&2; exit 1; }

python3 - <<'PY'
from pathlib import Path
p=Path('backend/src/meowprinter/protocol/models.py')
s=p.read_text()
if '"X5h-DBA2"' not in s:
    anchor='    "PD01": _PD01,\n'
    if anchor not in s:
        raise SystemExit('Could not find PD01 registry entry')
    s=s.replace(anchor, anchor+'    # X5h-DBA2: standard 384 px Tiny protocol profile\n    "X5h-DBA2": _DEFAULT,\n', 1)
p.write_text(s)
PY

chmod +x build-android.sh build-helper.sh clean-rebuild-android.sh

echo 'Patch applied. Build with: ./clean-rebuild-android.sh'
