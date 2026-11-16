import json
import time
import urllib.request
from pathlib import Path

case = json.loads(Path('/case/case.json').read_text())
result = {'status': 'failed', 'reply': '', 'error': ''}
try:
    req = urllib.request.Request('http://127.0.0.1:8787/ask',
        data=json.dumps({'text': case['message']}).encode(),
        headers={'Authorization': 'Bearer local-eval-only-secret', 'Content-Type': 'application/json'},
        method='POST')
    with urllib.request.urlopen(req, timeout=190) as resp:
        result['reply'] = json.load(resp)['reply']
        result['status'] = 'completed' if result['reply'].strip() else 'failed'
except Exception as exc:
    result['status'] = 'timeout' if isinstance(exc, TimeoutError) else 'failed'
    result['error'] = repr(exc)

# The app is a long-lived HTTP process: wait for the SDK's periodic atomic
# trajectory snapshot before Harbor collects /logs/agent/ at agent completion.
trajectory = Path('/logs/agent/trajectory.json')
for _ in range(24):
    if trajectory.is_file():
        try:
            steps = json.loads(trajectory.read_text()).get('steps', [])
            if steps:
                result['trajectory_steps'] = len(steps)
                break
        except (OSError, ValueError):
            pass
    time.sleep(0.5)
else:
    result['trajectory_steps'] = 0
    result['status'] = 'failed'
    result['error'] = (result['error'] + '; ' if result['error'] else '') + 'no LLM/tool trajectory captured'
Path('/logs/agent/result.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
