import csv
import io
import json
import re
import sqlite3
from pathlib import Path
import yaml

case = json.loads(Path('/case/case.json').read_text())
result = json.loads(Path('/logs/agent/result.json').read_text())
root = Path('/case/workspace')
reply = result['reply']
kind = case['kind']
errors = []

def check(condition, message):
    if not condition:
        errors.append(message)

def text(path):
    p = root / path
    check(p.is_file(), f'missing {path}')
    return p.read_text() if p.is_file() else ''

check(result['status'] == 'completed', f"turn status: {result['status']} {result['error']}")
check(bool(reply.strip()), 'no final answer')
if kind == 'budget-template':
    lines = list(csv.reader(io.StringIO(text('weekend_trip_budget.csv'))))
    check(len(lines) >= 2 and lines[0] == ['Total Budget', '600'], 'missing separate total row')
    check(any(line[:2] == ['Category', 'Budgeted'] for line in lines[1:]), 'missing separate category header')
    check('weekend_trip_budget.csv' in reply, 'no path reported')
elif kind == 'budget-update':
    raw = text('weekend_trip_budget.csv')
    rows = list(csv.reader(io.StringIO(raw)))
    check(len(rows) >= 6 and rows[0] == ['Total Budget', '600'], 'malformed CSV rows')
    check(any(row[:2] == ['Meals', '25'] for row in rows), 'meals not added')
    check(any(row[:2] == ['Unallocated', '287'] for row in rows), 'remaining amount incorrect')
    check(text('weekend_trip_note.txt') == case['files']['weekend_trip_note.txt'], 'trip note changed')
    blocks = re.findall(r'```(?:csv|text)?\s*\n(.*?)```', reply, re.S | re.I)
    check(any(block.strip('\n') == raw.strip('\n') for block in blocks), 'displayed CSV differs from actual bytes (except trailing newline)')
elif kind == 'sqlite-path':
    p = root / 'books.db'
    check(p.is_file(), 'no database')
    if p.is_file():
        try:
            with sqlite3.connect(p) as db:
                rows = db.execute('select title from books').fetchall()
            check(len(rows) == 3, 'books table must have three entries')
        except Exception as exc:
            errors.append(f'database unusable: {exc}')
    check(str(p.resolve()) in reply, 'absolute path to created database omitted')
    check('sqlite3' in reply, 'command not shown')
elif kind == 'reminder':
    files = list((root / 'memory/reminders').glob('*.yaml'))
    check(bool(files), 'reminder not saved')
    if files:
        try:
            reminder = yaml.safe_load(files[0].read_text())
            check(isinstance(reminder, dict), 'YAML is not a mapping')
            if isinstance(reminder, dict):
                check(reminder.get('type') == 'absolute', 'wrong reminder type')
                check(reminder.get('at') == '2027-01-20T09:00:00-05:00', 'wrong date/time')
                check(reminder.get('tz') == 'America/New_York', 'wrong zone')
                check('Aunt Ruth' in reminder.get('prompt', ''), 'wrong reminder prompt')
        except Exception as exc:
            errors.append(f'invalid YAML: {exc}')
elif kind == 'groceries':
    lines = text('shopping/weekly-groceries.txt').splitlines()
    check(lines == ['- Milk', '- [x] Eggs', '- Bread', '- [x] Bananas', '- Yogurt', '- Spinach'], 'expected six separate list items with bought markers preserved')
else:
    errors.append('unknown case kind')
Path('/logs/verifier').mkdir(exist_ok=True)
Path('/logs/verifier/reward.txt').write_text('1' if not errors else '0')
print(json.dumps({'reward': 0 if errors else 1, 'errors': errors}, indent=2))
