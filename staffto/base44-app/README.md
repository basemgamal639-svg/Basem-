# StaffTO on Base44 (TanStack Start template)

Overlay for a Base44 app created from the TanStack Start template (live app id `6aee84f10934dffa9c61306a`).
Generated from the StaffTO source in `../src`, `../base44/entities` and `../base44/functions`:

- `src/staffto/` — the StaffTO client app (react-router), mounted by `src/routes/index.jsx` and `src/routes/$.jsx` (`ssr: false`).
- `src/lib/staffto-backend.js` — one validated TanStack server function; `src/lib/staffto/*.server.js` are the ported action handlers (same logic as the Deno functions; `Deno.env` → `secrets.get`).
- `src/routes/api/stripe-webhook.js` (signature-verified) and `src/routes/api/sitemap.js` (public live sitemap).
- `base44/entities/*.jsonc` — the 23 entity schemas with RLS/FLS.
- `tailwind.config.js`, `staffto-base.css` (appended to `src/index.css`), `public/`.
