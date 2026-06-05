# Supabase Setup

Run `supabase-schema.sql` in the Supabase SQL editor.

Add these Vercel environment variables:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
LINE_LOGIN_CHANNEL_ID=2010225094
LINE_CHANNEL_SECRET=your_messaging_api_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_messaging_api_channel_access_token
GEMINI_API_KEY=your_gemini_api_key
```

Do not put the service role key in frontend code. It is only used inside Vercel API routes.

The app stores finished transaction data only. Screenshots are not uploaded.
The LINE chat bot also stores short-lived pending extracted JSON in `line_pending_transactions`
when a receipt needs confirmation. Final saved records still go into `transactions`.

The frontend sends its LIFF access token to the Vercel API. The API verifies that token with LINE,
retrieves the LINE profile server-side, and uses the verified LINE user ID for Supabase queries.
`LINE_LOGIN_CHANNEL_ID` is the LINE Login / LIFF channel id. Do not replace it with the
Messaging API channel id from the Official Account.

## LINE Chat Bot Setup

1. Create a LINE Official Account and enable the Messaging API.
2. In the Messaging API channel, copy the channel secret into `LINE_CHANNEL_SECRET`.
3. Issue a long-lived channel access token and add it as `LINE_CHANNEL_ACCESS_TOKEN`.
4. Set the webhook URL to:

```text
https://dcaapp-five.vercel.app/api/line-webhook
```

5. Enable **Use webhook**.
6. Disable LINE Official Account auto-reply/greeting messages if they conflict with the bot replies.
7. Add the Official Account as a friend, then send a receipt screenshot or ask a portfolio question.
