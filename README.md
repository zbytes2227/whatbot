# WhatBot – WhatsApp Campaign Manager

WhatBot is a self-hosted dashboard for running WhatsApp outreach campaigns from up to 10 linked phones. It is built on Next.js, MongoDB and [Baileys](https://github.com/WhiskeySockets/Baileys).

## Features

- **Multiple WhatsApp profiles.** Link phones by QR code, rename them, and restart or log them out. Campaigns rotate sends across the profiles you select.
- **Campaigns:**
  - up to 4 message variations per campaign, plus spintax (`{Hi|Hello}`) and a `{{number}}` placeholder
  - attachments: images, MP4, MP3, PDF, DOCX, XLSX, PPTX
  - random delays (seconds or minutes), daily send limits and sending hours, all in a chosen time zone
  - schedule a start time, save drafts, duplicate campaigns, and run a campaign again (logs from earlier runs are kept)
  - send a test of any variation to your own number
- **Safe delivery:**
  - a recipient is never messaged twice in the same run
  - if the outcome of a send is uncertain (for example a timeout mid-send), the campaign pauses and asks you to choose: mark as sent, resend, or skip
  - campaigns survive restarts and resume automatically
- **Tracking.** Each message is tracked as sent, delivered, read or replied, using WhatsApp receipts. There are live per-campaign stats, a delivery log, and CSV exports (all / sent / failed / not yet sent).
- **Opt-outs.** Anyone who replies `STOP` or `UNSUBSCRIBE` is added to a do-not-contact list, which every campaign respects. You can also add and remove numbers by hand.
- **Contacts.** Paste numbers in any format, or import a CSV/TXT file. Numbers are normalised and de-duplicated. You can also extract members of your WhatsApp groups into a list.
- **Message logs.** Search and filter by status, source, profile and date range, then export to CSV.
- **Quick send** from the dashboard, and a **public API** (`POST /api/sendMessage`) for integrations.
- **Interface.** Light and dark mode, and layouts that work on mobile.

## Configuration

Copy `.env.example` to `.env` and fill in the values below. The same `.env` is used by `npm run dev`, `npm start` and Docker Compose.

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | yes | MongoDB connection string |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | yes | Dashboard login |
| `JWT_SECRET` | yes | Session signing secret, at least 32 characters (`openssl rand -base64 48`) |
| `TOKEN_API_PUBLIC` | for the API | Token for `POST /api/sendMessage` (`openssl rand -hex 32`) |
| `APP_TIMEZONE` | no | Default time zone (default `Asia/Kolkata`) |

`.env.example` documents the optional settings: session lifetime, cookie and proxy settings, profile count, media size limit, opt-out keywords, rate limits and logging.

> Upgrading from an older version: `JWT_TOKEN_ADMIN` is still accepted as the session secret, but rename it to `JWT_SECRET`. Everyone is signed out once after upgrading. The public API token now works **only** for `/api/sendMessage`.

## Running

### Docker (recommended)

```bash
cp .env.example .env   # then edit it
docker compose -f server_docker_compose.yml up -d --build
```

The `whatsapp-sessions` volume holds the linked-device keys. Keep it persistent and back it up, or you will have to scan QR codes again. Put the app behind a TLS reverse proxy (nginx, Caddy, Traefik), then set `ENABLE_HSTS=1`.

### Local development

```bash
npm install
npm run dev
```

Requires Node.js 22 or later and a reachable MongoDB.

## Public API

```http
POST /api/sendMessage
X-API-Key: <TOKEN_API_PUBLIC>
Content-Type: application/json

{ "contact": "9876543210", "msg": "Hello!", "client": "client1" }
```

`client` is optional. Without it, any connected profile is used. The token can also be sent as `accesstoken` in the body or as a Bearer token. Limited to `API_RATE_LIMIT_PER_MIN` requests per minute.

## How it runs

- `instrumentation.js` starts the background services when the server boots. These are the WhatsApp session restore, the campaign scheduler (which ticks every 15 s), and the receipt and opt-out listeners. Nothing depends on someone having the dashboard open.
- Each running campaign holds a lease in MongoDB, renewed every 30 s, so only one runner ever sends for a campaign. If the process dies, the lease expires (or is released on restart) and the campaign continues.
- Before sending, every message is recorded as `pending`. Errors before WhatsApp receives the message are retried, up to 3 times. Errors during the send are marked `unknown` and need your review, so a contact is never messaged twice without your say-so.
- Attachments are stored in their own collection (`media`), so campaign documents stay small.

## Project structure

- `app/`: dashboard pages (`(dashboard)/…`), login, shared UI kit (`components/ui.js`)
- `pages/api/`: API routes
- `lib/`: WhatsApp client manager, campaign runner, auth, validation helpers
- `models/`: Mongoose schemas
- `proxy.js`: redirects signed-out visitors to the login page

## Responsible use

Only message people who have agreed to hear from you. Bulk unsolicited messaging breaks WhatsApp's Terms of Service and can get numbers banned. The pacing, daily limits and opt-out handling are there to protect your recipients and your accounts.
