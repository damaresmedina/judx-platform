#!/usr/bin/env bash
# Hook: UserPromptSubmit — detecta "bom dia" e roda diagnóstico compacto
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.user_prompt // empty' 2>/dev/null | tr '[:upper:]' '[:lower:]')

if echo "$PROMPT" | grep -qE '(bom dia|boa tarde|boa noite|vamos l[aá])'; then
  RESULT=$(cd /c/Users/medin/projetos/judx-platform && node scripts/bom-dia.mjs 2>/dev/null)
  jq -n --arg ctx "$RESULT" '{
    "hookSpecificOutput": {
      "hookEventName": "UserPromptSubmit",
      "additionalContext": ("DIAG:\n" + $ctx + "\nApresentar briefing conciso. NAO rodar bom-dia.mjs de novo. NAO ler STATUS.md.")
    }
  }'
else
  echo '{}'
fi
