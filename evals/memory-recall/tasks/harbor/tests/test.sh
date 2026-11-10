#!/bin/sh
set -eu
mkdir -p /logs/verifier
python3 - <<'PY'
import json
from pathlib import Path
result = json.loads(Path('/logs/agent/result.json').read_text())
expected = json.loads(Path('/tests/expected.json').read_text())['expected']
reward = int(result['outcome'] == 'completed' and expected.casefold() in result['reply'].casefold())
Path('/logs/verifier/reward.txt').write_text(str(reward))
print(f"reward={reward}, outcome={result['outcome']}, expected={expected}, reply={result['reply']!r}")
PY
