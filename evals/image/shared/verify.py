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
    candidates = [p for p in root.iterdir() if p.is_file() and 'budget' in p.name.lower() and p.suffix.lower() in ('.csv', '.md')]
    check(len(candidates) == 1, 'expected one budget CSV or Markdown file')
    if len(candidates) == 1:
        budget = candidates[0]
        raw = budget.read_text()
        if budget.suffix.lower() == '.csv':
            lines = list(csv.reader(io.StringIO(raw)))
            check(len(lines) >= 2 and lines[0] == ['Total Budget', '600'], 'missing separate total row')
            check(any(line and line[0].strip().lower() == 'category' for line in lines[1:]), 'missing separate category header')
        else:
            lines = raw.splitlines()
            check(any('600' in line and 'budget' in line.lower() for line in lines), 'missing $600 total budget')
            check(any(line.lstrip().startswith('|') and 'Category' in line for line in lines), 'missing Markdown category table')
            check(any(line.lstrip().startswith('|---') or line.lstrip().startswith('| ---') for line in lines), 'missing Markdown table separator')
        check(str(budget.resolve()) in reply, 'absolute budget path not reported')
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
    databases = [p for p in root.iterdir() if p.is_file() and p.suffix.lower() in ('.db', '.sqlite')]
    check(len(databases) == 1, 'expected one SQLite database')
    if len(databases) == 1:
        p = databases[0]
        try:
            with sqlite3.connect(f'file:{p}?mode=ro', uri=True) as db:
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
