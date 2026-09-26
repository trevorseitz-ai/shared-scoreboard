# Shared Scoreboard

A real-time, two-side scoreboard built with Next.js, Supabase, and Vercel.

## How it works

- The host creates a game and keeps the main scoreboard open.
- The scoreboard displays one single-use QR invitation for each side.
- Each phone sees the complete score but can change only its own side.
- A typed amount can be added or subtracted. **Undo** reverses that side's most recent entry.
- Starting a new round resets both scores while keeping the phone controllers connected.
- Multiple games are isolated by unique game codes and capability tokens.

## Local development

```bash
pnpm install
pnpm dev
```

Without Supabase environment variables, development uses an in-memory preview store. This is for local testing only and resets when the server restarts.

For a persistent setup, copy `.env.example` to `.env.local`, fill in a Supabase project URL and publishable key, and apply the migration in `supabase/migrations`.

## Security model

Database tables have row-level security enabled and are not directly available to public clients. Narrow database functions expose only the operations the app needs:

- a public game code reads visible scoreboard state;
- a long controller token authorizes changes for one side only;
- a separate host token authorizes new rounds and controller replacement;
- controller links are single-claim, and replacement invalidates the previous phone.

Only the Supabase publishable key is used by the deployment. No database administrator key is stored in Vercel or sent to a browser.

## Checks

```bash
pnpm lint
pnpm build
```
