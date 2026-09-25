# Deploying to AWS EC2 with Docker Compose (behind Cloudflare)

This deploys the whole app — Next.js frontend, Express API, and MongoDB — as one
Compose stack on a single EC2 instance. Your Cloudflare-proxied domain terminates
HTTPS and forwards to the instance over HTTP on port 80.

```
Internet ──HTTPS──▶ Cloudflare ──HTTP──▶ EC2 :80 ──▶ frontend :3000
                                                       │  /api/*  (Next.js rewrite)
                                                       ▼
                                                    backend :4000 ──▶ mongo :27017
```

Only the frontend is published. The backend and database stay on the private
Compose network — they are never exposed to the internet.

---

## 1. Provision the EC2 instance

- **AMI:** Ubuntu 22.04/24.04 (or Amazon Linux 2023).
- **Size:** `t3.small` or larger. `t3.micro` (1 GB RAM) is tight — the Next.js
  build wants ~1.5 GB. If you must use micro, add a 2 GB swapfile before building.
- **Security group (inbound):**
  | Port | Source | Why |
  |------|--------|-----|
  | 22   | your IP only | SSH |
  | 80   | `0.0.0.0/0` (or, tighter, Cloudflare's IP ranges) | HTTP from Cloudflare |

  You do **not** open 4000 or 27017 — they stay internal.
  Tightening 80 to [Cloudflare's IP ranges](https://www.cloudflare.com/ips/) stops
  people bypassing Cloudflare by hitting the raw IP.

## 2. Install Docker + Compose

```bash
# Ubuntu
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # log out/in so `docker` works without sudo
docker compose version             # confirm the Compose v2 plugin is present
```

## 3. Get the code and set secrets

```bash
git clone <your-repo-url> interview_prep_kit
cd interview_prep_kit

cp .env.deploy.example .env
# Edit .env and set:
#   SESSION_SECRET  → node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
#   LLM_API_KEY     → your free Groq key (or any OpenAI-compatible provider)
nano .env
```

`.env` stays on the server only. `.dockerignore` keeps it out of the image, and
Compose reads it for `${...}` substitution.

## 4. Build and start

```bash
docker compose up -d --build
docker compose ps        # all three services should become healthy
docker compose logs -f   # watch startup (Ctrl-C to stop watching)
```

First build takes a few minutes (installs deps + runs the production Next build).
The image is built once and shared by the `backend` and `frontend` services.

Verify locally on the box before touching DNS:

```bash
curl -I http://localhost/login          # 200 → frontend up
curl -s http://localhost/api/auth/me    # {"error":{"code":"UNAUTHENTICATED"...}} → API reachable through the proxy
```

## 5. Point your Cloudflare domain at it

1. **DNS → Records:** add an **A record** for your host (e.g. `@` or `app`) →
   the EC2 **public IP**. Leave the cloud **orange (Proxied)**.
2. **SSL/TLS → Overview:** set the mode to **Flexible**.
   - The origin serves plain HTTP on :80, so Flexible (Cloudflare↔origin over HTTP)
     is the correct match. Browsers still get real HTTPS from Cloudflare, so the
     app's secure session cookie works.
   - If you later add a certificate at the origin (see "Hardening" below), switch
     this to **Full (strict)**.
3. Wait for DNS to propagate, then open `https://your-domain`.

That's it — register an account and create a kit.

---

## Everyday operations

```bash
docker compose logs -f backend          # tail one service
docker compose restart frontend         # restart a service
git pull && docker compose up -d --build  # deploy an update
docker compose down                     # stop (keeps the mongo volume/data)
```

**Back up the database** (the `mongo-data` volume):

```bash
docker compose exec -T mongo mongodump --archive --db interview_prep_kit > backup-$(date +%F).archive
# restore: docker compose exec -T mongo mongorestore --archive < backup-YYYY-MM-DD.archive
```

## Running the Section 9 batch on the server

The batch CLI runs in the same image against the running Mongo/LLM config:

```bash
docker compose run --rm \
  -e MONGODB_URI=mongodb://mongo:27017/interview_prep_kit \
  backend npm run evaluate -- --input fixtures/cases.json --output /tmp/kits.json
```

---

## Hardening (optional, later)

- **End-to-end TLS:** put [Caddy](https://caddyserver.com/) in front as a fourth
  service (or install a **Cloudflare Origin Certificate** on an nginx/Caddy proxy),
  publish 443 instead of 80, and switch Cloudflare to **Full (strict)**. Then the
  Cloudflare↔origin leg is encrypted too.
- **Lock port 80 to Cloudflare:** restrict the security-group rule to Cloudflare's
  published IP ranges so nobody can reach the origin IP directly.
- **Firewall:** enable `ufw` allowing only 22 and 80.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `SESSION_SECRET ... is not set` on `up` | You didn't create `.env` from the example, or left a required value blank. |
| Redirect loop in the browser | Cloudflare SSL mode is wrong — it must be **Flexible** for an HTTP origin. |
| `/api/...` returns 502 from the frontend | Backend isn't healthy yet — `docker compose logs backend` (usually a bad `MONGODB_URI` or missing `LLM_API_KEY`). |
| Build OOM-killed on `t3.micro` | Add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`, then rebuild. |
| Login works but you're logged out on refresh | The session cookie is `Secure`; make sure you're visiting `https://` (via Cloudflare), not the raw `http://` IP. |
