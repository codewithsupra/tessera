# Tessera

A local-first, multiplayer knowledge workspace — Obsidian's speed and data ownership, Notion's live collaboration and databases.

- **Local-first:** every page is a Yjs CRDT stored on your device (IndexedDB); opens instantly, works offline.
- **Multiplayer:** a custom Yjs provider syncs over InsForge realtime with chunking + gap recovery ([spike notes](docs/spike-m0-sync.md)).
- **Yours:** export everything as plain Markdown with frontmatter.

Stack: React 19 · Vite · TipTap · Yjs · Tailwind v4 · InsForge (auth, Postgres + RLS, realtime, functions, pgvector) · Vercel.

## Develop

```bash
npm install
npm run dev
npm test
```

Needs `.env.local` with `VITE_INSFORGE_URL` and `VITE_INSFORGE_ANON_KEY`.
