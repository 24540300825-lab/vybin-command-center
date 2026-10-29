# VY/BIN Command Center

A private workspace for planning, briefing and reviewing the VY/BIN 3D world. This repo is **separate** from the live game (`vybin-multiplayer`) and never touches it.

## What works today (step 2 of 6)

- Sign-in by emailed link (only allow-listed emails get a workspace)
- Briefs: create from a template, edit sections, reorder, autosave, live updates across windows
- Assets: track what the world needs and its status
- Activity feed and overview dashboard built from real data only
- Setup page that tests the database, file storage and live updates in plain language

Not built yet: file uploads and previews, 3D scene editor, Claude connection, GitHub/Vercel monitoring, art-direction rules. Sections for these show "Soon" and say so.

## How it is built

- Vite + React (plain JavaScript), no secrets in the browser
- Supabase (existing `vybin-studio` project): tables prefixed `cc_`, row-level security on every table, private storage bucket `cc-files`
- Every database rule requires a real signed-in account that belongs to the project; the multiplayer game's anonymous guests are explicitly excluded
- Deployed on its own Vercel project, `vybin-command-center`

## Setup values (public only)

Copy `.env.example` to `.env.local` and fill in:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never put a `service_role` key or any other secret in this project.

## Run locally

```
npm install
npm run dev
```

## Adding the owner

The `cc_allowed_emails` table decides who can create a workspace. Add an email there (in the Supabase table editor) to allow another person.

## Safety rules built in

- Original files are never deleted from the app: the storage bucket has no delete rule.
- Removing a brief section asks for a second click first.
