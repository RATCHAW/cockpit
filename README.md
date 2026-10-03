# Cockpit

A personal control center for finances, projects, boards and plans, all in one dashboard.

## Getting started

Requires Node 22+, pnpm 10 and Docker.

```sh
pnpm install
cp .env.example .env    # set BETTER_AUTH_SECRET to the output of: openssl rand -base64 32
pnpm db:up && pnpm db:migrate
pnpm dev
```

- App: http://localhost:5173
- API docs: http://localhost:5173/api/docs
- Email previews: http://localhost:3001

If `RESEND_API_KEY` is empty, verification and reset emails, including their links, are printed in
the API logs.

## Production

```sh
docker compose --profile app up --build -d   # http://localhost:8080
```

Set `APP_URL` to the public origin (for example `https://cockpit.example.com`). Also set
`BETTER_AUTH_SECRET`, `RESEND_API_KEY` and `EMAIL_FROM` in `.env`. Migrations run automatically
before the API starts.

See [CLAUDE.md](./CLAUDE.md) for architecture and conventions, and
[docs/design-system.md](./docs/design-system.md) for the design system.
