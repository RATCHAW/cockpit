# Cockpit

A personal control center: one dashboard with a sidebar, one section per area (finances, projects,
kanban boards, goals, and so on). We build it one section at a time and change course based on
feedback.

## Stack

- `apps/web`: Vite SPA. TanStack Router (file-based, `src/routes`), TanStack Query, TanStack Form,
  shadcn/ui and Tailwind v4.
- `apps/api`: Hono on Node with `@hono/zod-openapi`. Better Auth is mounted at `/api/auth/*`.
  Effect handles config, services and typed errors.
- `packages/db`: Drizzle with node-postgres. Schema is in `src/schema`; migrations are in `drizzle/`.
- `packages/email`: Resend and react-email templates. The API doesn't send any emails yet.
- `packages/ui`: shadcn components and the design tokens (`src/styles/globals.css`).
- `packages/tsconfig` and `packages/eslint-config` hold shared config.

The web app always calls the API same-origin at `/api`. In dev that goes through the Vite proxy. In
production, a Vercel rewrite (`apps/web/vercel.json`) sends it to the API on Coolify. Auth cookies are
first-party and CORS isn't involved. See `docs/deployment.md`.

## Conventions

- **Design:** follow `docs/design-system.md`. Use theme tokens (`bg-primary`, `text-body`,
  `rounded-xl`, `text-display-*`) and no raw hex. Wise green is for CTAs only.
- **Motion:** follow the Emil Kowalski skills in `.claude/skills` (`emil-design-eng`, `animate`,
  `review-animations`). Use strong ease-out curves, keep durations under 300ms, and don't animate
  frequent or keyboard-triggered actions.
- **Auth:** single-user. Sign-up is disabled, and the only account is created by
  `ensureOwner` (`packages/db/src/owner.ts`) from `OWNER_EMAIL` / `OWNER_PASSWORD` when the API
  container starts (`apps/api/src/release.ts`). Follow the Better Auth skills in `.claude/skills`.
  Server config is in `apps/api/src/lib/auth.ts`. After changing plugins or options, run `pnpm auth:generate`, then
  `pnpm db:generate` and `pnpm db:migrate`.
- **API routes:** add a router in `apps/api/src/routes/` with `createRouter()` and `createRoute()`,
  then chain it in `app.ts` so `AppType` picks it up. The web app calls it through the typed client
  in `apps/web/src/lib/api.ts`. Every route is documented at `/api/docs` (Scalar).
- **Effect:** services are `Context.Service` classes in `apps/api/src/lib/services.ts`. Run them
  through `runtime.runPromise(...)`. Model failures as `Data.TaggedError` and handle them with
  `catchTag`.
- **Validation:** use zod for request/response schemas (API) and forms (web, via `onDynamic` with
  `revalidateLogic()`).
- **Protected pages** go under `apps/web/src/routes/_app/`. Add their sidebar entry in
  `src/components/app-sidebar.tsx`.
- **Seeding:** when a feature adds tables, add a seeder in `packages/db/src/seed/seeders/` (use
  `drizzle-seed`, owned by `ctx.admin.id`) and register it in `seeders/index.ts`.
- **Shared UI:** add shadcn components with `pnpm dlx shadcn@latest add <name>` run from
  `packages/ui`. Afterwards, check that imports use `@cockpit/ui/lib/utils`; the CLI sometimes
  writes `from "cn"`.

## Commands

```sh
pnpm db:up          # start Postgres (docker compose)
pnpm db:migrate     # apply migrations
pnpm db:seed        # seed admin@example.com (password: admin@example.com) + feature demo data
pnpm db:reset       # truncate every table, then seed
pnpm dev            # api :3000 + web :5173 + email preview :3001
pnpm lint && pnpm typecheck
pnpm format
docker compose --profile app up --build   # production stack on :8080
```
