# hao.AI

Private, single-user web app for practicing spoken Mandarin conversation.
Product definition: `context/project-overview.md`. Architecture and invariants:
`context/architecture.md`. Build plan: `context/feature-spec/build-spec.md`.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build — must stay green after every unit
npm run lint
```

Copy `.env.example` to `.env.local` for local secrets; `.env*` is git-ignored.

## Deploy

Push to `main` → Vercel builds and updates the production URL. The dev/preview
URL is behind Vercel Deployment Protection (password) until auth lands in Unit 6.

## Status

Unit 0 (skeleton + deploy pipeline). See `context/progress-tracker.md`.
