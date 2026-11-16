import json
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
Path('/logs/agent/result.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
