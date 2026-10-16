# Deployment

```
browser ──► Vercel (apps/web, static SPA)
              └─ /api/* rewrite ──► cockpit-api.bendarsiayoub.com (Coolify: apps/api)
                                       └─► Postgres (Coolify, internal network only)
```

The browser only ever talks to the Vercel origin. `apps/web/vercel.json` proxies `/api/*` to the
API, so auth cookies stay first-party and no CORS is involved.

## API and database: Coolify

Coolify runs at `http://vivace-vps:8000`, in the **cockpit** project.

- **cockpit-db**: a Coolify-managed PostgreSQL. It isn't exposed publicly.
- **cockpit-api**: built from this repo (public GitHub, branch `main`) with
  `apps/api/Dockerfile`. It's served at `https://cockpit-api.bendarsiayoub.com` on port 3000, and
  the wildcard `*.bendarsiayoub.com` DNS already points at the VPS. Pushing doesn't deploy it,
  because the repo is pulled without a GitHub App. Deploy with **Redeploy** in Coolify.

When the container starts, `dist/release.js` applies migrations and runs `ensureOwner`, then the
server starts.

API environment variables (set in Coolify):

| Variable             | Value                                                |
| -------------------- | ---------------------------------------------------- |
| `DATABASE_URL`       | Internal URL of `cockpit-db`                         |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32`                            |
| `BETTER_AUTH_URL`    | The Vercel origin (cookies are issued for it)        |
| `WEB_URL`            | The Vercel origin                                    |
| `OWNER_EMAIL`        | The only account's email                             |
| `OWNER_PASSWORD`     | The only account's password (at least 12 characters) |
| `OWNER_NAME`         | Display name, only used when the account is created  |

To change the password, update `OWNER_PASSWORD` and restart or redeploy. The new password applies
and every session is signed out.

## Web: Vercel

The project is `sharbins-projects/cockpit`, served at `https://cockpit-bice-nu.vercel.app`. It
isn't connected to GitHub yet, so deploy from the repo root with `vercel deploy --prod`. Once the
Vercel GitHub App is installed on the repo, connecting it makes every push deploy.

The Vercel project root directory is `apps/web`. Vercel installs from the pnpm workspace root and
runs `vite build`, and the settings live in `apps/web/vercel.json`. If the API domain changes,
update the rewrite destination there.

The web app needs no environment variables. If its domain changes, update `BETTER_AUTH_URL` and
`WEB_URL` on the API.
