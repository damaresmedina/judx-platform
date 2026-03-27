---
name: icons-deploy
description: "Deploy the ICONS website (icons.org.br) to Vercel. Use this skill when the user asks to deploy, publicar, colocar no ar, push, or update icons.org.br, the ICONS landing page, cartografia, or any content on the icons-cartografia repository. Also trigger when user mentions 'vercel icons', 'deploy icons', 'atualiza o site', or references damaresmedina/icons-cartografia."
---

# ICONS Deploy — Deploy icons.org.br

## Repository

- **Local**: `C:\projetos\icons-cartografia`
- **Remote**: `github.com/damaresmedina/icons-cartografia`
- **Branch**: `master` (NOT main)
- **Domain**: icons.org.br (aliased via Vercel)
- **Vercel project**: `damaresmedinas-projects/icons-cartografia`

## Deploy Workflow

**RULE: Always ask for explicit confirmation before pushing or deploying.**

```bash
cd "C:\projetos\icons-cartografia"

# 1. Check state
git status
git diff --stat

# 2. Stage and commit
git add specific-files.html
git commit -m "feat: description"

# 3. Push
git push origin master

# 4. Deploy (only after user confirms)
npx vercel --prod --yes
```

## Current HTML Files

- `index.html` — Landing PT (copied from projus.github.io/icons)
- `cartografia_stf.html` — Cartografia do STF
- `linhas_decisorias_stf.html` — Linhas decisórias
- `ontologia.html` / `ontologia_v9.html` — Ontologia ICONS
- `protocolo_v2.html` through `protocolo_v9.html` — Versões do protocolo

## Verify After Deploy

```bash
curl -I https://icons.org.br 2>/dev/null | head -5
# Should return HTTP/1.1 200 OK
```

## Important Rules

- **NEVER** touch repos `projus/icons` on GitHub — always use `damaresmedina/icons-cartografia`
- Branch is `master`, not `main`
- Deploy only with explicit user confirmation
- The Vercel alias to icons.org.br is automatic after `--prod`
