#!/usr/bin/env bash
# Motherly: bitta buyruq bilan hammasini Docker'da ishga tushiradi.
#   ./deploy.sh          ishga tushirish / yangilash
#   ./deploy.sh stop     to'xtatish (ma'lumotlar saqlanadi)
#   ./deploy.sh logs     jonli loglarni ko'rish
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mXato:\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "Docker o'rnatilmagan. https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 || die "Docker ishlamayapti. Docker Desktop'ni oching yoki docker xizmatini yoqing."
docker compose version >/dev/null 2>&1 || die "'docker compose' topilmadi. Docker'ni yangilang."

case "${1:-up}" in
  stop) docker compose down; echo "To'xtatildi. Ma'lumotlar saqlanib qoldi."; exit 0 ;;
  logs) exec docker compose logs -f --tail=100 ;;
  up) ;;
  *) die "Noma'lum buyruq: $1 (up, stop yoki logs)" ;;
esac

code=""
random() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1" || true; }

# Birinchi ishga tushishda .env yaratiladi: maxfiy kalitlar tasodifiy qo'yiladi.
if [ ! -f .env ]; then
  say ".env yaratilmoqda"
  cp .env.example .env
  sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(random 24)|" .env
  sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$(random 48)|" .env
  rm -f .env.bak
  if [ -t 0 ]; then
    read -r -p "Gemini API kaliti (AI uchun, bo'sh qoldirsangiz keyin .env ga yozasiz): " key || true
    [ -n "${key:-}" ] && sed -i.bak "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=${key}|" .env && rm -f .env.bak
    read -r -p "Server manzili (masalan http://203.0.113.5:5100, bo'sh = http://localhost:5100): " url || true
    [ -n "${url:-}" ] && sed -i.bak "s|^PUBLIC_API_URL=.*|PUBLIC_API_URL=${url}|" .env && rm -f .env.bak
  fi
fi

say "Konteynerlar yig'ilmoqda va ishga tushirilmoqda (birinchi marta bir necha daqiqa oladi)"
docker compose up -d --build

# Backend javob berguncha kutamiz.
set -a; . ./.env; set +a
BACKEND_PORT="${BACKEND_PORT:-5100}"; WEB_PORT="${WEB_PORT:-3000}"
say "Backend ishga tushishi kutilmoqda"
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${BACKEND_PORT}/api/videos" || true)
  [ "$code" = "401" ] || [ "$code" = "200" ] && break
  sleep 2
done
[ "$code" = "401" ] || [ "$code" = "200" ] || die "Backend ishga tushmadi. Ko'rish: ./deploy.sh logs"

ADMIN=$(docker compose exec -T backend cat private/admin-credentials.json 2>/dev/null || true)

say "Tayyor!"
echo "  Veb-panel : http://localhost:${WEB_PORT}"
echo "  Backend   : http://localhost:${BACKEND_PORT}"
[ -n "$ADMIN" ] && echo "  Super admin (login va parol): $ADMIN"
echo
echo "  To'xtatish: ./deploy.sh stop    Loglar: ./deploy.sh logs"
