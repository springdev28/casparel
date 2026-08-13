# Casparel load tests

This suite uses [k6](https://grafana.com/docs/k6/latest/) to measure Casparel's
read-heavy MVP journeys without consuming AI credits or creating user data.

## Safety

- Use a staging database for ramp tests.
- Production permits only the one-user `smoke` profile by default.
- The suite never creates posts, messages, uploads, votes, assignments, or AI
  requests.
- Use a dedicated test account. Do not put credentials or tokens in this repo.
- Login happens once during setup so a run does not trip the login rate limiter.

## Profiles

| Profile         | Purpose                                                          | Peak virtual users |      Duration |
| --------------- | ---------------------------------------------------------------- | -----------------: | ------------: |
| `smoke`         | Health, page, catalog, and search verification                   |                  1 | One iteration |
| `public`        | Public page and database-backed catalog reads                    |                 50 |     3 minutes |
| `authenticated` | Dashboard, lists, classes, forum, activities, and workflow reads |                 30 |     3 minutes |

Ramp profiles require under 1% request failures, overall `p95` below 1 second,
overall `p99` below 2 seconds, health `p95` below 500 ms, and catalog or
authenticated `p95` below 1.2 seconds. The single-sample smoke profile uses
five-second catalog guards to detect outages and timeouts; use ramp results for
statistically meaningful latency acceptance.

## Run locally

Install k6 on macOS with `brew install k6`, then start the Casparel API with a
staging `DATABASE_URL`.

```bash
BASE_URL=http://127.0.0.1:8080 pnpm loadtest:smoke
BASE_URL=https://staging.example.com pnpm loadtest:public
```

For authenticated reads, provide either a short-lived token or dedicated test
credentials through the shell environment:

```bash
BASE_URL=https://staging.example.com \
SCHOOLAR_TOKEN=... \
pnpm loadtest:authenticated
```

```bash
BASE_URL=https://staging.example.com \
SCHOOLAR_TEST_EMAIL=load-test@example.com \
SCHOOLAR_TEST_PASSWORD=... \
pnpm loadtest:authenticated
```

Do not add these values to `.env` files that might be committed.

## Production smoke check

The following remains at one virtual user and one iteration:

```bash
BASE_URL=https://lightgrey-oyster-122608.hostingersite.com \
pnpm loadtest:smoke
```

Ramp tests against production fail closed. `ALLOW_PRODUCTION_LOAD=true` exists
only for a deliberate maintenance-window test after Hostinger and database
limits have been reviewed.
