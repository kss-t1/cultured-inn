---
name: environments
description: Where Kulturalna Karczma runs (local, prod) and how to reach each one: URLs, SSH, database, logs, deploying, running imports, calling the public and admin APIs. Consult it before deploying, debugging prod, or hitting an API.
user-invocable: true
---

# Environments

Two environments: **local** (the dev machine) and **prod** (the public site). Secrets are never in this file. Each environment keeps them in its own `.env`; read a value from there when a command needs it, and never print it, commit it or paste it into a PR.

## Rules for prod
- Prod is outward-facing with real data. Deploy, restart, run imports or write to its database **only when the user asks** for that action; reading logs and running `SELECT` queries is fine.
- Prod tracks `main` only. Merge a PR first, then ship it with `update.sh`.
- Destructive SQL follows the predicate check in CLAUDE.md, run against prod rows. Take a fresh dump first (Backups below).

## local

| What | Value |
|---|---|
| URL | http://localhost:3000 (admin at `/admin`) |
| Start | `bun run dev` (HMR; restart it if the browser shows a stale bundle) |
| Database | Postgres on localhost: `karczma` (dev), `karczma_test` (wiped by `bun test`); `psql -d karczma` |
| Secrets/config | `.env` in the checkout (template: `.env.example`) |
| Scheduler | off in dev; `IMPORTS_SCHEDULER=1` turns it on |
| Run imports | `bun run jobs:imports [--all \| <source-key>…]` |
| Admin account | `bun run admin:create <email>` (password from `ADMIN_PASSWORD` or a prompt) |
| "Deploy" | pull `main`, `bun run db:migrate`, restart `bun run dev` (CLAUDE.md) |

## prod

| What | Value |
|---|---|
| URL | https://kulturalnakarczma.duckdns.org (admin at `/admin`), health: `/healthz` |
| Host | Oracle Cloud Always Free VM `cultural-inn`, Frankfurt, VM.Standard.A1.Flex (1 OCPU, 6 GB, ARM), Ubuntu 24.04 |
| SSH | `ssh ubuntu@130.61.31.206` (key-only; `ubuntu` has sudo) |
| App | systemd unit `karczma`, user `karczma`, checkout `/home/karczma/app`, Bun at `/home/karczma/.bun/bin/bun` |
| Secrets/config | `/home/karczma/app/.env` (mode 600): `DATABASE_URL`, `SESSION_SECRET`, `APIFY_TOKEN`, `PUBLIC_BASE_URL` |
| Proxy/TLS | Caddy, `/etc/caddy/Caddyfile`; port 3000 is firewalled, so only Caddy reaches the app |
| Database | Postgres 16, database and role `karczma`; `sudo -u postgres psql karczma` |
| Backups | `/var/backups/karczma/karczma-<date>.dump`, nightly at 03:15 UTC, kept 14 days |
| DNS | DuckDNS, updated every 10 min by `/etc/cron.d/karczma-duckdns` (token in `/etc/karczma/duckdns-token`) |
| Scheduler | on (`NODE_ENV=production`): every 10 min, runs sources whose interval has passed |
| Setup from scratch | DEPLOY.md, `deploy/provision.sh` |

Common commands (from the dev machine):

```sh
ssh ubuntu@130.61.31.206 sudo /home/karczma/app/deploy/update.sh        # deploy main: pull, install, migrate, restart, healthz
ssh ubuntu@130.61.31.206 sudo journalctl -u karczma -n 100 --no-pager  # app and import logs ("[import]" lines)
ssh ubuntu@130.61.31.206 "sudo -u postgres psql karczma -c 'SELECT key, last_run_at, last_error FROM sources ORDER BY key'"
ssh ubuntu@130.61.31.206 "sudo -u karczma bash -c 'cd ~/app && ~/.bun/bin/bun run jobs:imports <source-key>'"   # run a source now
ssh ubuntu@130.61.31.206 "sudo -u postgres pg_dump -Fc karczma > /tmp/karczma-pre.dump"                        # ad-hoc dump before risky changes
```

Known prod-only behaviour:
- **Biletyna returns 403** to the VM's IP (datacenter block), so `biletyna-poznan` fails on prod while it works locally.
- **Facebook shows a login wall** to the VM for most Pages, so those sources use the paid Apify fallback ("direct fetch blocked; used Apify" in `last_error`).

## APIs (both environments)

Set `BASE=http://localhost:3000` or `BASE=https://kulturalnakarczma.duckdns.org`.

**Public:** no auth. Parameters are in README "Public API".

```sh
curl -s "$BASE/api/events?when=week&cat=larp,rpg" | jq '.events | length'
curl -s "$BASE/events/<slug>.ics"
```

**Admin:** `/api/admin/*`, using a session cookie (`karczma_session`) from logging in. Mutating requests must send `Origin: $BASE` (CSRF check against `PUBLIC_BASE_URL`). The prod admin login is in `.secrets/prod-admin` in the main checkout on the dev machine (gitignored; `BASE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`). Source it rather than copying the values, and never reset that account's password unless asked. On local, create a throwaway admin with `admin:create`.

```sh
set -a; . .secrets/prod-admin; set +a     # prod; on local, use your throwaway admin
jq -n --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{email:$e,password:$p}' \
  | curl -s -c /tmp/jar -H "Origin: $BASE" -H 'Content-Type: application/json' -d @- "$BASE/api/admin/login"
curl -s -b /tmp/jar "$BASE/api/admin/sources" | jq '.sources[0].key'
curl -s -b /tmp/jar -X POST -H "Origin: $BASE" "$BASE/api/admin/sources/<id>/run"
```

Routes: `src/routes/public.ts`, `src/routes/admin.ts` and `src/routes/adminImports.ts` (the route table at the bottom of each file).
