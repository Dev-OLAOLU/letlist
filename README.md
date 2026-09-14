# Letlist

Searchable Lagos apartment listings sourced from WhatsApp housing groups.

WhatsApp will **not** let a website or Cloud API number join the groups you already belong to. Letlist uses an inbox number instead: you forward listing posts, Letlist parses them, and the same unit is updated when the rent changes.

## WhatsApp connecting procedure

### 1. Create the inbox number

1. Open [Meta Developers](https://developers.facebook.com/apps/) and create an app.
2. Add the **WhatsApp** product.
3. Register a business phone number. That number is the Letlist inbox.

### 2. Deploy Letlist, then hook Meta

After this app is live on Vercel, in **WhatsApp → Configuration**:

| Field | Value |
| --- | --- |
| Callback URL | `https://YOUR-DOMAIN/api/whatsapp/webhook` |
| Verify token | `letlist-whatsapp` |

Subscribe to the **messages** field. The webhook already answers Meta’s verify handshake and checks `X-Hub-Signature-256` when `WHATSAPP_APP_SECRET` is set.

### 3. Vercel environment variables

Set these on the Vercel project (Production + Preview). Do not commit them.

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon Postgres. Without it, listings do not persist across deploys. |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Must match Meta’s verify token. Use `letlist-whatsapp`. |
| `WHATSAPP_APP_SECRET` | Yes in production | Signs inbound webhooks. |
| `WHATSAPP_ACCESS_TOKEN` | Yes for Cloud API | Permanent system user token. |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes for Cloud API | From the WhatsApp product dashboard. |
| `WHATSAPP_INBOX_PHONE` | Recommended | Digits only, e.g. `2348098765432`. |
| `WHATSAPP_PUBLIC_URL` | Optional | Public origin if the callback URL should not use the Vercel host. |

### 4. Connect the desk

Open **Desk → WhatsApp groups** on the live site.

1. Tap **Connect WhatsApp**.
2. Leave **Watching** on for every housing group you work in. Add any extra group by name.
3. Forward listing posts from those chats to the inbox number. If the group name is not in the message, start with `Forwarded from {group name}`.

Letlist reads rent, area, beds, and fees. A price drop on the same unit overwrites the live card instead of creating a duplicate.

**Paste a post** on the desk is the fallback when you are not at the inbox.

## Daily network

When a listing hits a group, forward it to the inbox (two taps). That is the whole feed. Unofficial WhatsApp Web scrapers are not used — they violate WhatsApp’s terms and get numbers banned.

## Scripts

```bash
npm install
npm run dev      # local preview
npm run build    # production build + database migrate
npm run typecheck
```
