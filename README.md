# VY/BIN Command Center

A private workspace for planning, briefing and reviewing the VY/BIN 3D world, with Claude as a collaborator. This repo is **separate** from the live game (`vybin-multiplayer`) and never changes it. The two only share one Supabase project, and every Command Center table starts with `cc_`.

## What is built

| Area | What it does |
| --- | --- |
| Overview | The one next step, plus open briefs, reviews waiting and assets still to deliver (real data only) |
| Briefs | Templates, sections, autosave, files attached to a brief, live updates across windows |
| Assets | Tracked with status, versions (every file added becomes the next version, history kept), 3D model preview with real polygon/texture counts |
| 3D scenes | Stand-in shapes or real models, move/rotate/resize, notes pinned in 3D, swap a stand-in for the finished model |
| Art direction | Written style rules, attached to briefs automatically |
| Ask Claude | Manual mode (copy prompt, paste reply) and local mode (Claude Code on your own computer through a helper), review and approve loop |
| Project health | Newest commits of watched GitHub repos, whether the website is on the newest code, site reachability, saved-data counts and storage |
| Setup & connections | Plain-language checks, connect/disconnect the helper |

Nothing shows invented numbers. Cost shown after a Claude run is a client-side estimate reported by Claude Code, never a usage limit.

## How it is built

- Vite + React (plain JavaScript). Only public values are in the browser.
- Supabase project `vybin-studio`: `cc_` tables, row-level security on every table, private storage bucket `cc-files`, magic-link sign-in limited to emails in `cc_allowed_emails`.
- Vercel project `vybin-command-center`. Deploys are started manually (no auto-deploy on push yet).
- Helper: `public/vybin-bridge.mjs` (plain Node, no packages). It runs on your computer, starts **your own** Claude Code, and only works inside the folder you choose.

## Claude and your account (important)

- This website never sees your Claude password, cookies or tokens. You sign in to Claude Code on your own computer the normal way.
- The helper pairs with a short code; only a hash of its device token is stored.
- Permission levels: *read only*, *edit files*, *edit files and run safe commands*. Each run uses the level you pick.

## Setup values (public only)

Copy `.env.example` to `.env.local`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never put a `service_role` key or any other secret in this project. Never commit `.env` files.

## Run locally

```
npm install
npm run dev
```

## Publishing

Push to `main`, then start a production deployment of that commit on Vercel (or connect the Vercel Git integration in the Vercel dashboard for automatic deploys). Project health shows whether the live site matches the newest commit.

## Adding another person

Add their email to the `cc_allowed_emails` table (Supabase table editor), then add them as a project member.

## Backups and restoring

- Files are never deleted from the app: removing one only hides it, and the storage bucket has no delete rule for the app.
- Briefs, assets and scenes live in Supabase. Turn on Supabase backups (plan dependent) and download a copy of important files from time to time.
- The database layout is kept in the Supabase migration history of the `vybin-studio` project. Do not edit `cc_` tables by hand unless you know what you are doing.

## Tested vs not tested

Tested for real: sign-in, briefs, file upload and remove, asset versions, scene editor basics, pairing the helper on Windows, one full read-only Claude run from the website, Project health with real GitHub data.

Not yet tested: the *edit files* and *edit files and run commands* levels on Windows, very long runs, Draco-compressed GLB files (not supported yet), private GitHub repositories (not shown), Vercel publish history (not connected).

## Known limits

- The helper does not copy brief attachments to your computer yet; Claude sees the written context only.
- Magic-link emails use Supabase's built-in sender, which allows only a few emails per hour. A custom email provider removes that limit.
