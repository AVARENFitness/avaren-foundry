# Sprint 6.4 — Phone Push Notifications

## Added
- Web Push service worker
- Per-device notification permission and subscription controls
- Supabase push-subscription storage with row-level security
- Secure Supabase Edge Function for assignment delivery
- VAPID-based server authentication
- Assignment deep links
- App-icon unread badge support
- Automatic stale-device cleanup

## Required setup
1. Run `docs/supabase/AVAREN_PUSH_NOTIFICATIONS_6_4.sql` in Supabase SQL Editor.
2. Generate VAPID keys with `node scripts/generate-vapid-keys.mjs`.
3. Add the public key as `VITE_VAPID_PUBLIC_KEY` in `.env.local` and Vercel.
4. Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT=mailto:hello@avarenfitness.com` to Supabase Edge Function secrets.
5. Deploy `supabase/functions/send-assignment-push`.

## iPhone
Phone push works on iOS 16.4 or later when AVAREN is saved to the Home Screen. Permission must be requested from the saved app using the Enable button in Notifications.
