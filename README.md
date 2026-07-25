# kundali-backend

Express API backend for kundali. Talks to Postgres and to
`kundali-ephemeris-service` over HTTP for chart calculations.

## Run locally (without Docker)

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, EPHEMERIS_SERVICE_URL, etc.
npm run dev
```

Requires a running Postgres instance matching `DATABASE_URL`. Migrations run
automatically on startup.

## Run with Docker

Build and run this service alone:

```bash
docker build -t kundali-backend .
docker run --rm -p 4000:4000 --env-file .env kundali-backend
```

This assumes Postgres and the ephemeris service are reachable at the
addresses in your `.env`.

To run the full stack (Postgres + ephemeris service + backend) together, use
the `docker-compose.yml` at the repo root (see root README).

## Health check

`GET /api/health`

## Tests

```bash
npm test
```
