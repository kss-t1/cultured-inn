#!/usr/bin/env bash
# Ships the latest main to the server: pull, install, migrate, restart, check /healthz.
#   ssh ubuntu@<server> sudo /home/karczma/app/deploy/update.sh
# Restarting interrupts an import that is running; the scheduler retries it on its next sweep.
set -euo pipefail

# Wrapped in a function so bash parses the whole script before git pull rewrites this file.
main() {
  sudo -u karczma env HOME=/home/karczma PATH=/home/karczma/.bun/bin:/usr/bin:/bin bash -c \
    "cd /home/karczma/app && git pull --ff-only origin main && bun install --frozen-lockfile && bun run db:migrate"
  systemctl restart karczma
  for _ in $(seq 60); do
    curl -sf -o /dev/null http://127.0.0.1:3000/healthz && { echo "karczma is up at $(sudo -u karczma git -C /home/karczma/app rev-parse --short HEAD)"; return; }
    sleep 1
  done
  journalctl -u karczma -n 50 --no-pager
  return 1
}
main "$@"
exit
