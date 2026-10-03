# Cockpit

A personal control center for finances, projects, boards and plans, all in one dashboard.

## Getting started

Requires Node 22+, pnpm 10 and Docker.

```sh
pnpm install
cp .env.example .env    # set BETTER_AUTH_SECRET to the output of: openssl rand -base64 32
pnpm db:up && pnpm db:migrate
pnpm db:seed            # sign in as admin@example.com / admin@example.com
pnpm dev
```

- App: http://localhost:5173
- API docs: http://localhost:5173/api/docs
- Email previews: http://localhost:3001

Cockpit is single-user: there is no sign-up or password reset, only email and password login.

## Production

The web app is on Vercel and the API and Postgres are on Coolify. See
[docs/deployment.md](./docs/deployment.md).

Every time the API container starts, it applies migrations and makes sure the owner account
(`OWNER_EMAIL` / `OWNER_PASSWORD`) exists. To change the password, change `OWNER_PASSWORD` and
redeploy. That also signs out every session.

To run the whole stack locally in Docker:

```sh
docker compose --profile app up --build -d   # http://localhost:8080
```

See [CLAUDE.md](./CLAUDE.md) for architecture and conventions, and
[docs/design-system.md](./docs/design-system.md) for the design system.
