---
name: judx-history
description: "Access and search past Claude Code conversation history. Use this skill when the user asks to recall previous conversations, find what was done before, search chat history, recover context from past sessions, or asks 'o que fizemos', 'quando foi', 'em qual sessão', 'lembra quando', 'encontra no histórico'. Also trigger when user needs to resume work from a previous session or wants a summary of past work."
---

# JudX History — Acesso ao Histórico de Conversas

Search and retrieve context from past Claude Code sessions.

## Data Location

- **History file**: `C:\Users\medin\.claude\history.jsonl`
- **Format**: One JSON object per line, each is a user message
- **Fields**: `display` (message text), `timestamp` (ms), `sessionId`, `project`, `pastedContents`
- **Encoding**: UTF-8 (use `errors='replace'` when reading)

## How to Search

Write a Python script to search history:

```python
import json, os
from datetime import datetime

results = []
with open(r'C:\Users\medin\.claude\history.jsonl', encoding='utf-8', errors='replace') as f:
    for line in f:
        try:
            d = json.loads(line)
            # Search in display text
            if 'SEARCH_TERM' in d.get('display', '').lower():
                ts = datetime.fromtimestamp(d['timestamp']/1000)
                results.append((ts, d['sessionId'][:12], d['display'][:200]))
        except:
            pass

for ts, sid, msg in results:
    print(f'{ts:%Y-%m-%d %H:%M} | {sid} | {msg}')
```

## What's Available

- **Only user messages** — Claude's responses are NOT stored in history.jsonl
- **946 messages** across 13 sessions (22/mar to 27/mar/2026)
- **Session files**: `C:\Users\medin\.claude\sessions\` — minimal metadata (PID, sessionId, cwd)
- **Memory files**: `C:\Users\medin\.claude\projects\C--Users-medin\memory\` — persistent memories across sessions

## Session Map (as of 27/mar/2026)

| Date | Msgs | Project | Context |
|---|---|---|---|
| 22/mar 16h | 2 | icons | CLAUDE.md creation |
| 22/mar 17h | 44 | medin | Schema SQL Supabase |
| 22/mar 21h | 53 | icons | Decision extraction |
| 23/mar 00h | 14 | icons | Continuation |
| 24/mar 17h | 128 | medin | JudX architecture |
| 25/mar 02h | 9 | medin | CF comentada STF |
| 25/mar 07h | 312 | medin | ICONS cleanup + docs |
| 25/mar 21h | 118 | medin | Continuation |
| 26/mar 06h | 28 | medin | Extraction status |
| 26/mar 09h | 26 | medin | Continuation |
| 26/mar 13h | 52 | medin | Troubleshooting |
| 26/mar 17h | 91 | medin | Pipeline STF + analysis |
| 27/mar 00h | 69+ | medin | Full analysis session |

## Common Operations

### List all sessions with summary
Group by sessionId, show first message and message count.

### Search by keyword
Search `display` field for terms. Good for finding: SQL queries run, files created, commands executed, decisions made.

### Find what was done on a specific date
Filter by timestamp range.

### Get all messages from a specific session
Filter by sessionId.

## Limitations

- No Claude responses stored — only user inputs
- Pasted content may be truncated in display (check `pastedContents` dict)
- Some messages contain `[Pasted text #N +X lines]` — the full content is in `pastedContents`
