# WhatsApp Attendance — Integration Guide

Instructions for wiring an external WhatsApp provider (QR-based wrapper, Twilio, Meta Cloud API, etc.) into the attendance feature.

> **Status**: DB schema, admin UI and a stub webhook are merged. The messaging layer is **not** implemented — this doc is the contract for whoever builds it.

---

## What's already in place

### Data model (`prisma/schema.prisma`)

- **`Player`** now has:
  - `phoneNumber String? @unique` — canonical Chilean mobile `569XXXXXXXX` (11 digits, no `+`). Normalization lives in `lib/phone-utils.ts#normalizeChileanPhone`.
  - `nicknames String[]` — optional aliases for personalization.
- **`PlayerMatch`** — one row per (player, match). Holds `attendanceStatus` (`PENDING|CONFIRMED|DECLINED|LATE|NO_SHOW`), `rating`, `goals`, `yellowCards`, `redCard`, `notes`.
- **`WhatsappMessage`** — conversation log. Fields:
  - `playerId Int` (FK → `Player`, cascade on delete)
  - `matchId Int?` (FK → `Match`, set null on delete) — the match the message is about, when resolvable.
  - `direction MessageDirection` — `INBOUND` or `OUTBOUND`.
  - `content String` (Text).
  - `timestamp DateTime` — provider-reported send time.
  - `createdAt DateTime` — server ingest time.

### Admin UI

- `/admin/players` — form includes **Teléfono (WhatsApp)** and **Apodos** fields. Phone is normalized on save; 400 on invalid, 409 on duplicate.
- `/admin/matches` — list of matches (tabs: Próximos / Pasados).
- `/admin/matches/[id]/attendance` — per-match editor. Has **"Inicializar asistencia"** button that creates `PENDING` rows for every active player, and **"Sincronizar con Liga B"** to pull goals/reds from scraped events.

### Webhook stub

- File: `app/api/whatsapp/webhook/route.ts`
- `GET /api/whatsapp/webhook` → `200 { ok: true }` (for provider verification handshakes).
- `POST /api/whatsapp/webhook` → `501 Not Implemented`. Currently just logs the raw body.

### Auth

`middleware.ts` protects `/api/admin/*`. The webhook path (`/api/whatsapp/webhook`) is **not** behind session auth — it must be callable by the external provider. Protect it with a shared secret (see "Securing the webhook" below).

---

## What you need to implement

### 1. Outbound — send an attendance question

A function that takes a `(playerId, matchId)` and sends a WhatsApp message like:

> "Hola Juan, ¿juegas el partido del sábado vs. Los Cóndores a las 19:00?"

Suggested shape:

```ts
// lib/whatsapp.ts  (new file)
export async function sendAttendancePrompt(
  playerId: number,
  matchId: number
): Promise<{ providerMessageId: string } | { error: string }>
```

Responsibilities:

1. Load `Player` + `Match` + opposing team + date.
2. Verify `player.phoneNumber` exists; if not, return `{ error: 'no phone' }` so the caller can mark `PlayerMatch.attendanceStatus = NO_SHOW` or skip.
3. Build the message body. Use `player.nicknames[0] ?? player.name.split(' ')[0]` for the greeting.
4. Call the provider SDK/HTTP API.
5. On success: `prisma.whatsappMessage.create({ data: { playerId, matchId, direction: 'OUTBOUND', content, timestamp: new Date() } })`.

Wire this into the admin UI via a new endpoint, e.g. `POST /api/admin/matches/[id]/attendance/broadcast` that iterates players with `attendanceStatus === 'PENDING'` and calls `sendAttendancePrompt` for each. Add a button in `app/admin/matches/[id]/attendance/attendance-editor.tsx`.

### 2. Inbound — classify replies

Replace the stub `POST /api/whatsapp/webhook`:

1. **Verify shared secret** (header or query param — depends on provider). Reject 401 on mismatch.
2. Parse the provider payload. Extract: `from` (phone), `body` (text), `timestamp`.
3. Normalize `from` via `normalizeChileanPhone` (`lib/phone-utils.ts`).
4. Resolve `Player`: `prisma.player.findUnique({ where: { phoneNumber } })`. If null → log and return 200 (unknown sender, don't error the provider).
5. Resolve `Match`: find the most recent `OUTBOUND` `WhatsappMessage` to that player within the last 72h with a non-null `matchId`. That's the match they're replying about. If none, leave `matchId = null` on the inbound row.
6. Persist: `WhatsappMessage.create({ direction: 'INBOUND', playerId, matchId, content: body, timestamp })`.
7. **Classify** the reply with a small helper (regex + LLM fallback). Map to `attendanceStatus`:
   - "sí", "voy", "confirmo", "obvio", "dale" → `CONFIRMED`
   - "no", "no puedo", "no voy" → `DECLINED`
   - "tarde", "llego tarde" → `LATE`
   - anything else → leave `PENDING` and optionally reply asking for clarification.
8. If matched and classified, upsert `PlayerMatch`:
   ```ts
   prisma.playerMatch.upsert({
     where: { playerId_matchId: { playerId, matchId } },
     update: { attendanceStatus },
     create: { playerId, matchId, attendanceStatus },
   })
   ```
9. Return `200 { ok: true }` to the provider.

### 3. (Optional) Group message on match day

A separate job/endpoint that posts a roster summary to the team group chat once all replies are in or when the admin clicks "Publicar convocatoria".

---

## Provider-agnostic contract

The internal API should not leak provider-specific fields. Define a thin adapter interface in `lib/whatsapp.ts`:

```ts
export interface WhatsappProvider {
  send(to: string, body: string): Promise<{ id: string }>
  parseInbound(req: Request): Promise<{ from: string; body: string; timestamp: Date } | null>
  verifySignature(req: Request): boolean
}
```

Swap implementations via env var (`WHATSAPP_PROVIDER=qr|twilio|meta`). Start with one.

---

## Securing the webhook

The webhook is public by design. Protect it with one of:

- **Shared secret header**: provider includes `X-Integration-Key: <secret>` on every POST. Compare against `process.env.WHATSAPP_WEBHOOK_SECRET`. Simplest.
- **HMAC signature**: provider signs the body with a shared secret; we verify. Use this if the provider supports it (Meta Cloud API does).
- **IP allowlist**: only useful if the provider has stable egress IPs.

Add whichever matches your provider to `verifySignature` in the adapter above. Do **not** rely on the `middleware.ts` admin matcher — the provider has no session cookie.

Also add rate limiting (e.g. 60 req/min per sender) to prevent abuse.

---

## Env vars to add

```
WHATSAPP_PROVIDER=qr
WHATSAPP_WEBHOOK_SECRET=<random-string>
WHATSAPP_API_URL=<provider endpoint>
WHATSAPP_API_TOKEN=<provider token>
WHATSAPP_GROUP_JID=<group chat id, if using group broadcasts>
```

Add them to `.env.example` and document in `docs/running.md`.

---

## Testing checklist

1. **Handshake**: `curl http://localhost:3000/api/whatsapp/webhook` → `200 { ok: true }`.
2. **Auth**: `curl -X POST http://localhost:3000/api/whatsapp/webhook -d '{}'` without secret → `401`.
3. **Unknown sender**: POST with a phone not in `Player` → `200`, no DB write besides a log line.
4. **Known sender, no recent outbound**: reply is stored with `matchId = null`.
5. **Known sender, recent outbound, "sí"**: `PlayerMatch.attendanceStatus` flips to `CONFIRMED` and inbound message is logged.
6. **Phone normalization**: sender `+56 9 9562-0994` resolves to the player whose stored `phoneNumber` is `56995620994`.
7. **Duplicate webhook delivery**: re-posting the same inbound event does not double-update (idempotency key = provider message id; store it on `WhatsappMessage` if available).

---

## Files you'll touch

Create:
- `lib/whatsapp.ts` — provider adapter + send/classify helpers.
- `app/api/admin/matches/[id]/attendance/broadcast/route.ts` — trigger outbound batch.

Modify:
- `app/api/whatsapp/webhook/route.ts` — replace stub with real parser + classifier.
- `app/admin/matches/[id]/attendance/attendance-editor.tsx` — add "Enviar consulta por WhatsApp" button.
- `.env.example`, `docs/running.md` — document new env vars.

Do **not** modify:
- `prisma/schema.prisma` for attendance/message fields — the schema is already final for v1.
- `lib/phone-utils.ts` — normalization is frozen; if the provider gives you a different format, normalize at the adapter layer.

---

## Open questions to resolve before coding

1. Which provider? (QR wrapper is fastest to stand up; Meta Cloud API is more reliable long-term.)
2. One webhook URL per environment or a tunneling setup (ngrok) for local dev?
3. Do we send to individual chats only, or also broadcast to a team group?
4. How to handle replies after the match has started (LATE vs ignore)?
5. What's the fallback for players without `phoneNumber`? (Current UI allows the field to be empty.)
