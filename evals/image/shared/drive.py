import json
import pathlib
import urllib.request

case = json.loads(pathlib.Path('/case/case.json').read_text())
result = {'outcome': 'failed', 'reply': ''}
try:
    req = urllib.request.Request('http://127.0.0.1:8787/ask',
        data=json.dumps({'text': case['question']}).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer local-eval-token'})
    with urllib.request.urlopen(req, timeout=150) as response:
        result = {'outcome': 'completed', 'status': response.status,
                  'reply': json.load(response)['reply']}
except Exception as exc:
    result['error'] = repr(exc)
pathlib.Path('/logs/agent/result.json').write_text(json.dumps(result))
print(json.dumps(result))
