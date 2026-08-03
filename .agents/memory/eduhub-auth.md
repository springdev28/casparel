---
name: EduHub auth design decisions
description: Durable auth architecture decisions for EduHub — no third-party auth packages, token security rules.
---

## Rule
Use native Node.js crypto for auth (no bcrypt, no jsonwebtoken packages).

## Why
Avoids native binding compilation issues in the Replit environment; `crypto.scrypt` and `crypto.createHmac` are sufficient for an MVP.

## Key decisions
- Tokens include `exp` field (7-day TTL); expired tokens are rejected by `decodeToken`.
- `SESSION_SECRET` env var **must** be set — the server throws at startup if absent; no dev fallback.
- Logout is client-side only (clear localStorage); this is acceptable for MVP since tokens expire.
- For production, a token denylist (DB-backed sessions table) is the right next step.
