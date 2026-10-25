#!/usr/bin/env bash
# Blue-green deploy for a Linux VPS (docs/DEPLOYMENT.md, section 5). Two copies of the site, "blue" and "green", each with its own
# folder and port. The new version is built and started in the copy that is not serving, checked on its own port, and only then does
# nginx send visitors to it. The old copy keeps running, so going back is one switch.
#
# Run it on the server, only with the owner's permission:
#   deploy/blue-green.sh deploy [git-ref]   build and start the idle copy at git-ref (default origin/main), check it, switch to it
#   deploy/blue-green.sh rollback           check the other copy and switch back to it
#   deploy/blue-green.sh status             which copy serves, and whether each answers its health check
# DRY_RUN=1 prints every command instead of running it. Paths and ports can be changed with the variables below.
set -euo pipefail

ROOT="${SOB_ROOT:-/srv/sellonbay}"                          # holds blue/, green/ and active (the name of the serving copy)
REPO="${SOB_REPO:-https://github.com/arnobai70-del/sellonbay.git}"
ENV_FILE="${SOB_ENV_FILE:-/etc/sellonbay/env}"              # production variables, set on the server only, never in GitHub
UPSTREAM="${SOB_UPSTREAM:-/etc/nginx/sellonbay-upstream.conf}" # one line that nginx includes: server 127.0.0.1:<port>;
BLUE_PORT="${SOB_BLUE_PORT:-3101}"
GREEN_PORT="${SOB_GREEN_PORT:-3102}"
HEALTH_TRIES="${SOB_HEALTH_TRIES:-30}"                      # one try every 2 seconds
DRY_RUN="${DRY_RUN:-0}"

say() { printf '%s\n' "$*"; }
die() { printf 'Stopped: %s\n' "$*" >&2; exit 1; }
run() { if [ "$DRY_RUN" = 1 ]; then say "+ $*"; else "$@"; fi; }

port_of() { if [ "$1" = blue ]; then say "$BLUE_PORT"; else say "$GREEN_PORT"; fi; }
other_of() { if [ "$1" = blue ]; then say green; else say blue; fi; }
active() { if [ -f "$ROOT/active" ]; then cat "$ROOT/active"; else say none; fi; }

healthy() {
  local port="$1" i
  if [ "$DRY_RUN" = 1 ]; then say "+ curl http://127.0.0.1:$port/api/health (up to $HEALTH_TRIES tries)"; return 0; fi
  for ((i = 1; i <= HEALTH_TRIES; i++)); do
    if curl -fsS --max-time 5 "http://127.0.0.1:$port/api/health" | grep -q '"ok":true'; then return 0; fi
    sleep 2
  done
  return 1
}

# Points nginx at a port. The new file is checked with nginx -t before reload; if the check fails, the old file is put back.
point_nginx_at() {
  local port="$1"
  if [ "$DRY_RUN" = 1 ]; then say "+ write 'server 127.0.0.1:$port;' to $UPSTREAM, nginx -t, reload nginx"; return 0; fi
  cp "$UPSTREAM" "$UPSTREAM.bak" 2>/dev/null || true
  printf 'server 127.0.0.1:%s;\n' "$port" > "$UPSTREAM"
  if ! nginx -t >/dev/null 2>&1; then
    if [ -f "$UPSTREAM.bak" ]; then mv "$UPSTREAM.bak" "$UPSTREAM"; fi
    die "nginx refused the new setting; nothing was switched"
  fi
  systemctl reload nginx
}

build() {
  local copy="$1" ref="$2" dir="$ROOT/$1"
  if [ ! -d "$dir/.git" ]; then run git clone --quiet "$REPO" "$dir"; fi
  run git -C "$dir" fetch --quiet --tags origin
  run git -C "$dir" checkout --quiet --force "$ref"
  run ln -sfn "$ENV_FILE" "$dir/.env.production.local"
  if [ "$DRY_RUN" = 1 ]; then say "+ cd $dir"; else cd "$dir"; fi
  run npm ci --no-audit --no-fund
  run npm run build
  cd - >/dev/null 2>&1 || true
  say "Built $copy at $(if [ "$DRY_RUN" = 1 ]; then say "$ref"; else git -C "$dir" rev-parse --short HEAD; fi)."
}

deploy() {
  local ref="${1:-origin/main}" now next port
  [ "$DRY_RUN" = 1 ] || [ -f "$ENV_FILE" ] || die "$ENV_FILE is missing"
  now="$(active)"
  if [ "$now" = none ]; then next=blue; else next="$(other_of "$now")"; fi
  port="$(port_of "$next")"
  [ "$DRY_RUN" = 1 ] || grep -qx "PORT=$port" "$(dirname "$ENV_FILE")/port-$next" 2>/dev/null || die "$(dirname "$ENV_FILE")/port-$next must say PORT=$port"
  say "Serving now: $now. Building $next on port $port from $ref."
  build "$next" "$ref"
  run systemctl restart "sellonbay@$next"
  healthy "$port" || die "$next did not answer on port $port; visitors stay on $now. Logs: journalctl -u sellonbay@$next"
  point_nginx_at "$port"
  if [ "$DRY_RUN" = 1 ]; then say "+ write $next to $ROOT/active"; else printf '%s\n' "$next" > "$ROOT/active"; fi
  if [ "$now" = none ]; then say "Serving $next."; else say "Switched to $next. $now keeps running; deploy/blue-green.sh rollback goes back to it."; fi
}

rollback() {
  local now back port
  now="$(active)"
  [ "$now" != none ] || die "nothing has been deployed with this script yet"
  back="$(other_of "$now")"
  port="$(port_of "$back")"
  healthy "$port" || die "$back does not answer on port $port; start it (systemctl start sellonbay@$back) or deploy again"
  point_nginx_at "$port"
  if [ "$DRY_RUN" = 1 ]; then say "+ write $back to $ROOT/active"; else printf '%s\n' "$back" > "$ROOT/active"; fi
  say "Back on $back."
}

status() {
  local c
  say "Serving: $(active)"
  for c in blue green; do
    if [ "$DRY_RUN" != 1 ] && curl -fsS --max-time 5 "http://127.0.0.1:$(port_of $c)/api/health" >/dev/null 2>&1; then
      say "$c (port $(port_of $c)): up"
    else
      say "$c (port $(port_of $c)): not answering"
    fi
  done
}

case "${1:-}" in
  deploy) deploy "${2:-}" ;;
  rollback) rollback ;;
  status) status ;;
  *) say "Usage: $0 deploy [git-ref] | rollback | status"; exit 2 ;;
esac
