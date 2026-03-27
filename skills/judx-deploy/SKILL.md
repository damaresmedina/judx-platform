---
name: judx-deploy
description: "Deploy the JudX platform (judx-platform.vercel.app) to Vercel. Use this skill when the user asks to deploy, publicar, push, or update the JudX platform, landing page, or any content on judx-platform. Also trigger when user mentions 'vercel judx', 'deploy judx', or references damaresmedina/judx-platform."
---

# JudX Deploy — Deploy judx-platform

## Repository

- **Local**: `C:\Users\medin\projetos\judx-platform`
- **Remote**: `github.com/damaresmedina/judx-platform`
- **Branch**: check with `git branch` (may be `main` or `master`)
- **Domain**: judx-platform.vercel.app
- **Vercel project**: `judx-platform`
- **Stack**: Next.js 16 + React 18 + TypeScript + Tailwind CSS

## Deploy Workflow

**RULE: Always ask for explicit confirmation before pushing or deploying.**

```bash
cd "C:\Users\medin\projetos\judx-platform"

# 1. Check state
git status
git log --oneline -5

# 2. Stage and commit
git add specific-files
git commit -m "feat: description"

# 3. Push
git push origin main

# 4. Deploy (only after user confirms)
npx vercel --prod --yes
```

## Key Files

- `public/landing.html` — Landing PT
- `public/landing-en.html` — Landing EN
- `scripts/` — All extraction and analysis scripts
- `PROTOCOLO_JUDX.md` — Canonical protocol document (v1.1)
- `.env.local` — Supabase keys (NEVER commit)

## Running Dev Server

```bash
cd "C:\Users\medin\projetos\judx-platform"
npm run dev  # Port 3000
```

Note: dev server may already be running (check `tasklist | grep node`).

## Important Rules

- Deploy only with explicit user confirmation
- NEVER commit `.env.local` or files with credentials
- The `scripts/` directory contains extraction pipelines — these run independently, not via Vercel
- `PROTOCOLO_JUDX.md` is the canonical reference — update version number when making changes
