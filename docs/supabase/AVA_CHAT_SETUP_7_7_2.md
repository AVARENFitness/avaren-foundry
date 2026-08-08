# AVA Chat (Sprint 7.7.2 + Patch 7.7.4)

Secure server-side conversational AVA via Supabase Edge Function with **server-trusted context**.

## Trust model (Patch 7.7.4)

| Class | Sent by client? | Resolved by server? |
|-------|-----------------|---------------------|
| SERVER_TRUSTED facts | No | Yes — from Supabase under JWT user |
| USER_SUBJECTIVE session | Yes | Merged into model payload |
| CLIENT_HINTS (daypart, tz) | Yes (advisory) | Passed through, not authoritative |

## Secrets (Supabase Edge Function only)

Set in Supabase project secrets — **never** in client `.env` or Vite variables:

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Language model provider key |
| `AVA_CHAT_MODEL` | Optional model id (default `gpt-4o-mini`) |

Supabase automatically provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions.

## Deploy

From the project root:

```bash
supabase secrets set OPENAI_API_KEY=your_key_here
supabase secrets set AVA_CHAT_MODEL=gpt-4o-mini
supabase functions deploy ava-chat
```

## Client requirements

The React app only needs existing public Supabase env vars:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The user must be authenticated. Unauthenticated sessions use deterministic AVA fallback only.

## Request contract (Patch 7.7.4)

Client sends:

```json
{
  "message": "I'm tired",
  "sessionContext": {
    "recentMessages": [],
    "temporaryConstraints": ["I'm tired"],
    "userStatements": [],
    "topic": null,
    "lastRecommendation": null
  },
  "clientHints": {
    "daypart": "evening",
    "timezoneOffset": 300
  }
}
```

Server fetches trusted facts and builds model context. Client-supplied `context`, `readiness`, `userId`, or `athleteId` fields are **ignored**.

## Server query strategy

Four parallel queries per message:

1. `foundry_state` (state blob)
2. `coach_assignments` (active assigned/started for athlete)
3. `nutrition_profiles` (goals)
4. `nutrition_days` (today's log)

Private coach tables are never queried.

## Behavior when not deployed

If the Edge Function is missing or `OPENAI_API_KEY` is unset, Ask AVA automatically falls back to the deterministic conversation layer (Sprint 7.7.1). Daily Briefing is unaffected.

## Protections

- Authenticated user required (JWT bearer)
- Identity from JWT only — spoofed user IDs rejected/ignored
- Server-grounded coach assignment + readiness (when cloud-synced)
- 2000 character message limit
- 12-message conversation window
- ~350 output token cap
- 25s request timeout
- 30 requests / minute / user (in-function memory bucket)

## Verify

```bash
curl -i "$SUPABASE_URL/functions/v1/ava-chat" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"I only have 30 minutes","sessionContext":{"recentMessages":[],"temporaryConstraints":["I only have 30 minutes"]},"clientHints":{"daypart":"evening"}}'
```

Expect JSON with `message`, `intent`, and optional `suggestedAction`.
