# Supabase Setup

Run `supabase-schema.sql` in the Supabase SQL editor.

Add these Vercel environment variables:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Do not put the service role key in frontend code. It is only used inside Vercel API routes.

The app stores finished transaction data only. Screenshots are not uploaded.

