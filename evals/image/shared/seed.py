import json
from pathlib import Path

case = json.loads(Path('/case/case.json').read_text())
root = Path('/case/workspace')
root.mkdir(exist_ok=True)
for name, text in case.get('files', {}).items():
    path = root / name
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('unsafe fixture path')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
conversation = root / 'memory/conversations/2026-11-16.json'
conversation.parent.mkdir(parents=True, exist_ok=True)
conversation.write_text(json.dumps([
    {'role': role, 'content': content, 'ts': 1794840000000 + i}
    for i, (role, content) in enumerate(case.get('history', []))
]))
