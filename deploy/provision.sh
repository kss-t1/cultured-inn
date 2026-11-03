#!/usr/bin/env bash
# Turns a fresh Ubuntu 24.04 VM (Oracle Cloud Always Free) into a Kulturalna Karczma server:
# Postgres, Bun, the app under systemd (which runs the import scheduler), Caddy for HTTPS,
# nightly database dumps and a DuckDNS updater. See DEPLOY.md.
#
# Usage, as root on the VM:
#   DOMAIN=karczma.duckdns.org DUCKDNS_TOKEN=… [APIFY_TOKEN=…] bash provision.sh
# Re-running is safe: an existing .env (with its secrets) and the database are kept.
set -euo pipefail

: "${DOMAIN:?set DOMAIN, e.g. karczma.duckdns.org}"
REPO="${REPO:-https://github.com/kss-t1/cultured-inn.git}"
BUN_VERSION="${BUN_VERSION:-1.4.4}"
APP_USER=karczma
APP_HOME=/home/$APP_USER
APP_DIR=$APP_HOME/app
ENV_FILE=$APP_DIR/.env

as_app() { sudo -u "$APP_USER" env HOME="$APP_HOME" PATH="$APP_HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin" bash -c "cd $APP_DIR 2>/dev/null; $1"; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -yq postgresql postgresql-contrib caddy git curl unzip openssl iptables-persistent

# Oracle's Ubuntu images ship iptables rules that REJECT everything but SSH; open 80 and 443
# above that REJECT. Port 3000 stays closed, so X-Forwarded-For can only come from Caddy.
for port in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null; then
    reject=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')
    iptables -I INPUT "${reject:-1}" -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT
  fi
done
netfilter-persistent save

id "$APP_USER" &>/dev/null || useradd --create-home --shell /bin/bash "$APP_USER"
if [ "$(as_app 'bun --version' 2>/dev/null)" != "$BUN_VERSION" ]; then
  as_app "curl -fsSL https://bun.sh/install | bash -s bun-v$BUN_VERSION"
fi
[ -d "$APP_DIR/.git" ] || as_app "git clone $REPO $APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  db_password=$(openssl rand -hex 24)
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$APP_USER'" | grep -q 1; then
    sudo -u postgres psql -qc "ALTER ROLE $APP_USER PASSWORD '$db_password'"
  else
    sudo -u postgres psql -qc "CREATE ROLE $APP_USER LOGIN PASSWORD '$db_password'"
  fi
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'karczma'" | grep -q 1 ||
    sudo -u postgres createdb -O "$APP_USER" karczma
  install -m 600 -o "$APP_USER" -g "$APP_USER" /dev/stdin "$ENV_FILE" <<EOF
NODE_ENV=production
DATABASE_URL=postgres://$APP_USER:$db_password@localhost:5432/karczma
PUBLIC_BASE_URL=https://$DOMAIN
PORT=3000
SESSION_SECRET=$(openssl rand -hex 32)
TRUST_PROXY=1
APIFY_TOKEN=${APIFY_TOKEN:-}
EOF
fi

as_app "bun install --frozen-lockfile && bun run db:migrate && bun run db:seed"

install -m 644 "$APP_DIR/deploy/karczma.service" /etc/systemd/system/karczma.service
systemctl daemon-reload
systemctl enable karczma
systemctl restart karczma

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
	}
	reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload-or-restart caddy

install -d -m 700 -o postgres -g postgres /var/backups/karczma
cat > /etc/cron.d/karczma-backup <<'EOF'
# Nightly dump of the karczma database, kept for 14 days. Restore: see DEPLOY.md.
15 3 * * * postgres pg_dump -Fc karczma > /var/backups/karczma/karczma-$(date +\%F).dump && find /var/backups/karczma -name '*.dump' -mtime +14 -delete
EOF

if [ -n "${DUCKDNS_TOKEN:-}" ] && [[ "$DOMAIN" == *.duckdns.org ]]; then
  install -d -m 700 /etc/karczma
  install -m 600 /dev/stdin /etc/karczma/duckdns-token <<<"$DUCKDNS_TOKEN"
  cat > /etc/cron.d/karczma-duckdns <<EOF
# Keeps $DOMAIN pointed at this VM (an empty ip= means "the address this request comes from").
*/10 * * * * root curl -fsS -o /dev/null "https://www.duckdns.org/update?domains=${DOMAIN%.duckdns.org}&token=\$(cat /etc/karczma/duckdns-token)&ip="
EOF
  curl -fsS "https://www.duckdns.org/update?domains=${DOMAIN%.duckdns.org}&token=$DUCKDNS_TOKEN&ip=" && echo
fi

for _ in $(seq 60); do curl -sf -o /dev/null http://127.0.0.1:3000/healthz && break; sleep 1; done
curl -sf -o /dev/null http://127.0.0.1:3000/healthz && echo "karczma is up; https://$DOMAIN may take a minute while Caddy gets a certificate" ||
  { journalctl -u karczma -n 50 --no-pager; exit 1; }
