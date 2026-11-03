# Deploying Kulturalna Karczma

The public site runs on one free Oracle Cloud VM (Always Free, Ampere ARM, Ubuntu 24.04), with a free DuckDNS subdomain. Everything is on the VM:

| Piece | Where |
|---|---|
| App (web server and import scheduler) | systemd unit `karczma`, running `bun src/server.ts` from `/home/karczma/app` as user `karczma` |
| Secrets (`DATABASE_URL`, `SESSION_SECRET`, `APIFY_TOKEN`) | `/home/karczma/app/.env`, mode 600 |
| Database | Postgres 16 on localhost, database and role `karczma` |
| HTTPS | Caddy (`/etc/caddy/Caddyfile`), Let's Encrypt certificate obtained automatically |
| Backups | `pg_dump` every night at 03:15 to `/var/backups/karczma`, kept 14 days (`/etc/cron.d/karczma-backup`) |
| Domain | DuckDNS, re-pointed at the VM every 10 minutes (`/etc/cron.d/karczma-duckdns`) |

Imports need no separate setup. In production the server checks every 10 minutes for sources that are due (README, "Scheduler").

## One-time setup

### 1. Oracle Cloud account and VM (in the web console)

1. Sign up at <https://signup.cloud.oracle.com>. The home region can't be changed later; pick **Germany Central (Frankfurt)**. A card is needed for verification only.
2. **Upgrade to Pay As You Go** (Billing → Upgrade and Manage Payment). Always Free resources stay free, and Oracle stops reclaiming VMs it considers idle; this site is idle most of the time. Then add a budget alert (Billing → Budgets, e.g. 1 EUR) so any accidental paid resource emails you.
3. Compute → Instances → **Create instance**:
   - Image: **Canonical Ubuntu 24.04** (not Minimal).
   - Shape: **VM.Standard.A1.Flex**, 2 OCPU and 12 GB (the free allowance is 4 OCPU and 24 GB in total). "Out of capacity" means try again later or another availability domain.
   - Networking: keep the new VCN and public subnet, and **assign a public IPv4 address**.
   - SSH keys: paste the public key of the machine you deploy from (`cat ~/.ssh/id_ed25519.pub`).
4. Open the web ports: instance → subnet → Security Lists → Default Security List → **Add Ingress Rules**: source `0.0.0.0/0`, TCP, destination port `80`; then the same for `443`.
5. Optional: Networking → Reserved Public IPs, to keep the same address if the VM is ever recreated. DuckDNS follows the address anyway.

### 2. DuckDNS subdomain

Sign in at <https://www.duckdns.org>, add a subdomain (e.g. `kulturalnakarczma` gives `kulturalnakarczma.duckdns.org`), and copy the token shown at the top.

### 3. Provision the VM

From a checkout on your machine:

```sh
scp deploy/provision.sh ubuntu@<ip>:
ssh ubuntu@<ip> "sudo DOMAIN=<sub>.duckdns.org DUCKDNS_TOKEN=<token> APIFY_TOKEN=<optional> bash provision.sh"
ssh ubuntu@<ip> "sudo -u karczma bash -c 'cd ~/app && ADMIN_PASSWORD=<12+ chars> ~/.bun/bin/bun run admin:create you@example.com'"
```

The script installs Postgres, Bun, Caddy and the app, opens ports 80/443 in the VM's own iptables (Oracle's images block them), creates the database and `.env` with fresh secrets, migrates, seeds and starts everything. The first imports start about 30 seconds after the app starts. poznan.pl alone takes about 7 minutes.

## Shipping an update

After a PR is merged to `main`:

```sh
ssh ubuntu@<ip> sudo /home/karczma/app/deploy/update.sh
```

It pulls `main`, installs dependencies, runs migrations, restarts the app and waits for `/healthz`.

## Operating it

```sh
ssh ubuntu@<ip>
sudo journalctl -u karczma -f                  # app and import logs
sudo systemctl status karczma caddy postgresql
sudo -u karczma bash -c 'cd ~/app && ~/.bun/bin/bun run jobs:imports druga-era-ics'   # run one source now
sudo -u postgres psql karczma                  # database shell
```

**Restore a backup** (stops the app, replaces the database):

```sh
sudo systemctl stop karczma
sudo -u postgres dropdb karczma && sudo -u postgres createdb -O karczma karczma
sudo -u postgres pg_restore -d karczma --no-owner --role=karczma /var/backups/karczma/karczma-<date>.dump
sudo systemctl start karczma
```

The backups are on the VM's own disk, so they protect against mistakes, not against losing the VM. For an off-machine copy: `ssh ubuntu@<ip> sudo cat /var/backups/karczma/<file> > <file>`.

**Security updates.** Ubuntu's unattended-upgrades installs them daily. Reboot now and then (`sudo reboot`); every service starts again on boot.
