# AVAREN 8.10.4 — Appointment Push Worker Deployment

Database migration 8.10 is installed. This guide covers edge function deployment and scheduling only.

## Edge functions

Deploy both workers:

```bash
supabase functions deploy dispatch-appointment-notifications
supabase functions deploy process-appointment-reminders
```

Required secrets (same as existing push stack):

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (optional, default `mailto:hello@avarenfitness.com`)

## Scheduler (Supabase Dashboard)

No `pg_cron` is installed. Use **Supabase Dashboard → Edge Functions → Schedules**.

| Function | Cron | Purpose |
|---|---|---|
| `dispatch-appointment-notifications` | `*/5 * * * *` | Immediate lifecycle + RSVP push delivery |
| `process-appointment-reminders` | `*/5 * * * *` | 2-hour athlete + coach reminder worker |

Both functions require a **Supabase secret key** on the `apikey` header (8.10.6). Do not use `Authorization: Bearer` with `sb_secret_` keys — the platform rejects non-JWT bearer tokens when `verify_jwt` is enabled.

`supabase/config.toml` sets `verify_jwt = false` for both workers. Runtime auth validates the `apikey` header against `SUPABASE_SECRET_KEYS` before any privileged DB work.

## Legacy cutover

If `process-session-reminders` is still scheduled, **disable it** before enabling the new reminder worker to avoid duplicate athlete reminders.

Precheck: no legacy cron should remain active after cutover.

## Optional faster immediate delivery

For near-real-time lifecycle push (instead of up to 5 minutes):

1. Supabase Dashboard → Database → Webhooks
2. Create webhook on `appointment_notification_deliveries` INSERT
3. Target: `dispatch-appointment-notifications`
4. Add header: `apikey: <Supabase secret key>`

## Manual worker test

```bash
# Expect 401 — no header
curl -i -X POST "$SUPABASE_URL/functions/v1/process-appointment-reminders"

# Expect 401 — invalid key
curl -i -X POST "$SUPABASE_URL/functions/v1/process-appointment-reminders" \
  -H "apikey: sb_secret_invalid"

# Expect 200 — valid secret key on apikey header
curl -i -X POST "$SUPABASE_URL/functions/v1/process-appointment-reminders" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Content-Type: application/json"
```

Repeat the same three checks for `dispatch-appointment-notifications`.

Create a DEV appointment ~2 hours away, then run the valid-key command twice. Expect one athlete push and one coach push on the first run, zero on the second.

## iPhone requirements

Web Push on iPhone requires AVAREN installed to the Home Screen (PWA standalone mode). Normal Safari tabs cannot receive push even after permission is granted.
