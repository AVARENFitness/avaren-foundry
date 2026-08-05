# AVAREN Push Setup

## 1. Run the database migration
Open Supabase → SQL Editor → New Query. Paste all contents of:

`docs/supabase/AVAREN_PUSH_NOTIFICATIONS_6_4.sql`

Run it once.

## 2. Generate VAPID keys
From the AVAREN project directory:

```bash
node scripts/generate-vapid-keys.mjs
```

Keep both keys private while completing setup.

## 3. Configure the web app
Create or update `.env.local`:

```env
VITE_VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY
```

Add the same variable to the Vercel project and redeploy.

## 4. Configure Supabase secrets
Using the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set \
  VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY \
  VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY \
  VAPID_SUBJECT=mailto:hello@avarenfitness.com
```

## 5. Deploy the Edge Function

```bash
npx supabase functions deploy send-assignment-push
```

## 6. Enable a device
Open AVAREN → Notifications → Enable phone notifications.

On iPhone, AVAREN must be saved to the Home Screen and opened from its Home Screen icon before the permission button is used.
