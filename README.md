# Letlist

Searchable Lagos apartment listings sourced from WhatsApp housing groups.

WhatsApp will **not** let a website or Cloud API number join the groups you already belong to. Letlist uses the Meta-registered inbox as the data centre: this machine **pulls** from Cloud API, you forward listing posts (text, photos, and videos) to that number, Letlist parses them onto search cards, and the same unit is updated when the rent changes.

## WhatsApp connecting procedure

Two numbers:

1. **Cloud API inbox** — Meta-registered business number. Forward listing posts here. This machine pulls from it.
2. **Your WhatsApp** — already in the groups. Clients tap this on a listing card.

### 1. Save both numbers

Open **Desk → WhatsApp groups**, enter the two numbers, tap **Save numbers**.

### 2. Connect Meta on this machine (the puller)

In [Meta Developers](https://developers.facebook.com/apps/) → your app → **WhatsApp → API Setup**:

- Copy the **access token** (system user token is best; temporary tokens expire in 24 hours)
- Copy the **Phone number ID** (not the digits you dial)

Paste both on the desk, tap **Connect Meta**. Letlist verifies the line with Graph API and starts pulling.

### 3. Hook the webhook (live public URL)

In WhatsApp → **Configuration**:

| Field | Value |
| --- | --- |
| Callback URL | `https://YOUR-DOMAIN/api/whatsapp/webhook` |
| Verify token | `letlist-whatsapp` |

Tap **Verify and save**. Then **Manage** and subscribe to **messages**.

### 4. Production environment variables

On a public host, set:

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon Postgres. Without it listings reset on every cold start. |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Must match Meta’s verify token. Use `letlist-whatsapp`. |
| `WHATSAPP_APP_SECRET` | Yes in production | Signs inbound webhooks. App settings → Basic. |
| `WHATSAPP_ACCESS_TOKEN` | Yes for Cloud API | Permanent system user token from WhatsApp → API Setup. |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes for Cloud API | From WhatsApp → API Setup. |
| `WHATSAPP_INBOX_PHONE` | Recommended | Inbox digits, e.g. `2348030000000`. |
| `WHATSAPP_AGENT_PHONE` | Optional | Your personal WhatsApp digits for listing cards. |
| `WHATSAPP_PUBLIC_URL` | Optional | Public origin if the callback URL should not use the host. |

### 5. Forward listings

1. Leave **Watching** on for every housing group you work in.
2. Forward listing posts from those chats to the inbox number — include the photos and videos. If the group name is not in the message, start with `Forwarded from {group name}`.
3. Tap **Pull now** on the desk, or wait for the puller (about once a minute).

Letlist reads rent, area, beds, and fees, and copies the forwarded photos/videos onto the live card. A price drop on the same unit overwrites the listing instead of creating a duplicate.

**Paste a post** on the desk is the fallback when you are not at the inbox — attach the same photos there.

## Daily network

When a listing hits a group, forward it (photos included) to the inbox. That is the whole feed. Unofficial WhatsApp Web scrapers are not used — they violate WhatsApp’s terms and get numbers banned.

## Scripts

```bash
npm install
npm run dev      # local preview
npm run build    # production build + database migrate
npm run typecheck
npm run whatsapp status
npm run whatsapp pull
```
