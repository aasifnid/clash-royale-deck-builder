# Clash Royale Deck Builder

A personal Clash Royale companion: a **second opinion on the deck you play**, and the **strongest top-player decks you can field at your real card levels**, both backed by real battle results.

The gap it fills: the in-game Deck Wizard (Nov 2026) can already build a deck. It doesn't show whether that exact list has actually won, how it does against the decks near your trophies, or which of your cards are holding it back. This tool does.

## How it works

1. **Sync your account** by player tag (public, no password), or add cards by hand. Card levels, evolutions, heroes, king-tower level and your selected in-game deck are stored locally and editable.
2. **Check your deck.** Grade your current deck, or paste a deck link (from the game or the Deck Wizard): its real win rate if top players run it, its expected result against the decks sampled near your trophies, under-leveled cards, shape problems (no spell, nothing that hits air, too many win conditions) with the best fix from your own cards, and at most one or two swaps, each backed by a real list's record. A deck with a structural hole is never rated "keep".
3. **Find new decks.** A deterministic engine ranks the current top-ladder meta (`data/meta-decks.json`, refreshed twice a month from ~1,000 top players' battle logs) against your collection:
   - **Real lists first.** Proven win rate on the exact 8 cards you'd field leads the score, then your card levels, then how the deck fares against what you face.
   - **Honest swaps.** A listed card you don't own, or own under-leveled, is replaced by a same-type card. Beyond that, at most two optional swaps for much higher-level cards. Every swap is named with its reason, and a deck is only labelled a top-player list when the shown 8 cards really are one (or one card off).
   - **Three different decks.** Picks differ by win condition and share at most four cards.
4. **What to upgrade next.** The cards whose next levels open up the most strong top-player lists (52%+ over 30+ games) for you, nearest first.
5. **Your real results.** Saved decks remember the win rate we predicted. "Check my results" reads your recent ranked battles (the API keeps the last ~25-30) and shows how each saved deck actually did. Deck Check shows your own record with the checked deck too.
6. **Coaching.** Each deck gets a game plan, counters and play tips generated from its archetype and actual cards. Fully free and offline. If an `ANTHROPIC_API_KEY` is set, an optional AI layer re-ranks and rephrases instead.

The hand-written library in `data/proven-decks.json` (32 decks, last edited Jul 2026) is now only a fallback for accounts that can't field a meta deck, and the source of card roles and substitutes.

## Stack

Next.js (App Router) + React + Tailwind v4. Collection and saved decks live in `localStorage`. Card data is bundled from the RoyaleAPI community dataset; player progression comes from the official Clash Royale API via the RoyaleAPI proxy.

## One-time setup

Only one thing is needed, and it's free:

1. Create a free token at <https://developer.clashroyale.com>. When creating it, allowlist the RoyaleAPI proxy IP: **`45.79.218.79`** (Vercel's outbound IPs are dynamic, so the proxy gives you one fixed IP to allowlist).
2. Copy `.env.local.example` to `.env.local` and fill in:
   ```
   CR_API_TOKEN=...
   ```

`ANTHROPIC_API_KEY` is **optional** — leave it blank. Coaching works without it. Set it only if you have a key and want the AI to re-rank/rephrase.

The app even works without the CR token: skip syncing and add your cards by hand.

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

- **Data refresh is automatic.** `.github/workflows/refresh-meta.yml` runs on the 8th and 22nd: it re-pulls cards and the meta, commits, and runs `scripts/meta-check.mjs`, which opens an issue when a meta deck has a win condition the classifier doesn't know. The fix is to add it to `WIN_CONDITIONS` in **both** `lib/archetypes.ts` and `scripts/meta-cluster.mjs`.
- **Tests:** `npm test` runs the engine tests against a real account snapshot (`tests/fixtures/account-2026-11.json`) plus the meta-cluster tests. CI (`.github/workflows/test.yml`) runs them with typecheck and lint on every push.
- `node scripts/refresh-cards.mjs` / `node scripts/refresh-meta.mjs` refresh the data by hand (needs `CR_API_TOKEN`).

## Optional config

- `COACH_MODEL` env var overrides the coaching model (default `claude-sonnet-4-6`).
