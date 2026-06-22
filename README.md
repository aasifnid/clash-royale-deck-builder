# Clash Royale Deck Builder

A personal deck builder that recommends **proven, winning decks filtered to the cards you actually own** — at the levels you own them — and coaches you on each like a top player would.

The gap it fills: generic "best deck" guides assume card levels and unlocks you may not have. This tool only ever suggests decks you can field, then has an AI coach rank and explain them.

## How it works

1. **Sync your account** by player tag (public — no password), or add cards by hand. Card levels, evolutions, champions, and king-tower level are stored locally and fully editable.
2. **A deterministic engine** scores every deck in a library of ~30 proven archetype decks against your collection: ownership, card-level fit for your arena, ease of play, substitutions for missing cards.
3. **An AI coach (Claude)** ranks the best 2–3 of that pre-validated shortlist and writes the gameplan, win condition, counters, and play tips. It can only pick from the shortlist, so it never suggests a card you don't own.

## Stack

Next.js (App Router) + React + Tailwind v4. Collection and saved decks live in `localStorage`. Card data is bundled from the RoyaleAPI community dataset; player progression comes from the official Clash Royale API via the RoyaleAPI proxy.

## One-time setup

1. Create a free token at <https://developer.clashroyale.com>. When creating it, allowlist the RoyaleAPI proxy IP: **`45.79.218.79`** (Vercel's outbound IPs are dynamic, so the proxy gives you one fixed IP to allowlist).
2. Get an Anthropic API key at <https://console.anthropic.com>.
3. Copy `.env.local.example` to `.env.local` and fill in:
   ```
   CR_API_TOKEN=...
   ANTHROPIC_API_KEY=...
   ```

The app works without these — you just lose account sync (use manual entry) and AI coaching (it falls back to the engine's top pick).

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Deploy to Vercel

```bash
vercel        # link/create the project
vercel --prod # deploy
```

Then add `CR_API_TOKEN` and `ANTHROPIC_API_KEY` as Environment Variables in the Vercel project settings (Production + Preview).

## Maintenance

- `node scripts/refresh-cards.mjs` re-pulls the card master data (run after a balance/season update; the roster changes ~monthly).
- `data/proven-decks.json` is the deck library — edit it to add decks or update the meta. Each deck has 8 slots with a role, a skill-floor rating (1–5), and pro-known substitutes per slot.

## Optional config

- `COACH_MODEL` env var overrides the coaching model (default `claude-sonnet-4-6`).
