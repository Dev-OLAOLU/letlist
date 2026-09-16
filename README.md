# Letlist

Searchable Lagos apartment listings sourced from WhatsApp housing groups.

WhatsApp will **not** let a website or Cloud API number join the groups you already belong to. Letlist uses an inbox number instead: you forward listing posts, Letlist parses them, and the same unit is updated when the rent changes.

## WhatsApp connecting procedure

WhatsApp will **not** let Letlist join housing groups on your personal number. Two numbers:

1. **Cloud API inbox** — Meta-registered business number. Forward listing posts here.
2. **Your WhatsApp** — already in the groups. Clients tap this on a listing card.

### 1. Save both numbers

Open **Desk → WhatsApp groups**, enter the two numbers, tap **Save numbers**.

### 2. Hook Meta (live Vercel URL)

In [Meta Developers](https://developers.facebook.com/apps/) → your app → **WhatsApp → Configuration** (or Use cases → Customize → Configuration):

| Field | Value |
| --- | --- |
| Callback URL | `https://YOUR-DOMAIN/api/whatsapp/webhook` |
| Verify token | `letlist-whatsapp` |

Tap **Verify and save**. Then **Manage** and subscribe to **messages**.

The desk **Test handshake** button proves Letlist answers Meta’s GET challenge.

### 3. Vercel environment variables

Set these on the Vercel project (Production + Preview). Do not commit them, and do not paste tokens into the desk.

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon Postgres. Without it Vercel falls back to in-memory PGLite and listings reset on every cold start. |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Must match Meta’s verify token. Use `letlist-whatsapp`. |
| `WHATSAPP_APP_SECRET` | Yes in production | Signs inbound webhooks. App settings → Basic. |
| `WHATSAPP_ACCESS_TOKEN` | Yes for Cloud API | Permanent system user token from WhatsApp → API Setup. |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes for Cloud API | From WhatsApp → API Setup. |
| `WHATSAPP_INBOX_PHONE` | Recommended | Inbox digits, e.g. `2348030000000`. |
| `WHATSAPP_AGENT_PHONE` | Optional | Your personal WhatsApp digits for listing cards. |
| `WHATSAPP_PUBLIC_URL` | Optional | Public origin if the callback URL should not use the Vercel host. |

### 4. Connect the desk

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
