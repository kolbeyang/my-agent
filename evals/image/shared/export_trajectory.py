"""Rebuild an ATIF transcript from the app's persisted conversation history.

The product logs only user/final assistant turns; it does not persist LLM requests,
tool calls, usage, or latency. Never invent them from the final answer.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

history_dir = Path('/case/workspace/memory/conversations')
steps = []
for path in sorted(history_dir.glob('*.json')):
    for entry in json.loads(path.read_text()):
        if entry['role'] not in ('user', 'assistant'):
            continue
        steps.append({
            'step_id': len(steps) + 1,
            'source': 'user' if entry['role'] == 'user' else 'agent',
            'message': entry['content'],
            'timestamp': datetime.fromtimestamp(entry['ts'] / 1000, timezone.utc)
                .isoformat().replace('+00:00', 'Z'),
        })

if steps:
    trajectory = {
        'schema_version': 'ATIF-v1.8',
        'agent': {
            'name': 'Sam',
            'version': 'unversioned',
            'model_name': os.environ['AGENT_MODEL_NAME'],
        },
        'notes': ('Reconstructed from memory/conversations daily JSON files. '
                  'These contain only user and final assistant messages, not exact '
                  'LLM requests, intermediate steps, tool calls/results, tokens, cost, '
                  'system prompt, retries, or per-call latency. The configured model '
                  'name does not prove how many LLM calls produced the response.'),
        'steps': steps,
    }
    dest = Path('/logs/agent/trajectory.json')
    dest.write_text(json.dumps(trajectory, ensure_ascii=False))
    print(f'Exported {len(steps)} persisted conversation turns to {dest}')
else:
    print('No conversation turns were persisted; no trajectory to export')
