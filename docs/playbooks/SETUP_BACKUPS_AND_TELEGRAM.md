# Setup: Cloudflare R2 backups + Telegram alerts

Two things only you can do, because both involve creating accounts and handling
secret keys. The code for both is already built, tested and deployed — it is
sitting idle waiting for these values.

Total time: **about 20 minutes.** Cost: **about $1–3/month** for R2, **free** for Telegram.

Nothing here is urgent-dangerous, but until the first one is done, **every copy
of Patriot's data lives inside one Supabase account.**

---

## Part 1 — Cloudflare R2 (the backup destination)

You already have your domain at Cloudflare, so this is in an account you own.

### 1. Create the bucket

1. Cloudflare dashboard → **R2 Object Storage** in the left sidebar.
2. If it asks you to enable R2, do that. It will ask for a payment card even
   though the free tier covers 10 GB — we will use about 0.25 GB.
3. **Create bucket**.
   - Name: `pontifex-backups`
   - Location: **Automatic**
   - **Leave public access OFF.** This bucket holds payroll, signed contracts
     and customer photos. It must never be public.

### 2. Create an API token scoped to that bucket only

1. On the R2 overview page → **Manage R2 API Tokens** → **Create API Token**.
2. Name: `pontifex-nightly-backup`
3. Permission: **Object Read & Write**
4. **Specify bucket** → `pontifex-backups`. Do not grant account-wide access —
   if this key ever leaks, it should reach nothing else.
5. TTL: **Forever** (a token that silently expires means backups silently stop).
6. Create it. Cloudflare shows you three things **once**:
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint** — looks like `https://<account-id>.r2.cloudflarestorage.com`

   Copy all three now. The secret is never shown again.

### 3. Put them in Vercel

Vercel → your project → **Settings** → **Environment Variables**. Add four, all
scoped to **Production**:

| Name | Value |
|---|---|
| `BACKUP_S3_ENDPOINT` | the endpoint URL from step 2 |
| `BACKUP_S3_BUCKET` | `pontifex-backups` |
| `BACKUP_S3_ACCESS_KEY_ID` | the Access Key ID |
| `BACKUP_S3_SECRET_ACCESS_KEY` | the Secret Access Key |

**Do not paste the secret into chat.** Type it straight into Vercel.

`BACKUP_S3_REGION` is not needed — R2 uses `auto`, which is the default.

### 4. Tell me, and I will verify

Environment variables only take effect on the next deployment, so this needs one
redeploy. Then I will run the backup by hand and confirm:

- the export actually completed (not "completed" with zero tables)
- every table is present, including `timecards`
- the storage files came across
- `backup_logs` has a real `completed` row

After that it runs itself at **08:00 UTC (4am ET)** nightly.

### 5. The part everyone skips

**A backup nobody has restored is a rumour, not a backup.** Once a quarter, I
will take the newest export, restore it into a scratch Supabase project, and
confirm we can see a real timecard and open a real signed PDF. Put it in your
calendar — it is the only thing that turns this from hope into a capability.

Two numbers you should know after the first test:
- **How much work could we lose?** With nightly exports: up to 24 hours.
- **How long to get back?** Realistically 2–4 hours.

---

## Part 2 — Telegram alerts

The goal, in your words: *"I don't access the hub every day and I also don't get
notifications."* This puts failures in your pocket.

### 1. Create the bot

1. Open Telegram, search for **@BotFather** (the one with the blue check).
2. Send `/newbot`.
3. Name it: `Pontifex Alerts`
4. Username: something ending in `bot`, e.g. `pontifex_alerts_bot`.
5. BotFather replies with a **token** like `8123456789:AAH...`. That token is a
   password — anyone holding it can post as your bot.

### 2. Create the alerts group

Do this as a **group**, not a direct message — it means you can add a PM or a
second phone later without redoing anything.

1. New Group → name it `Pontifex Alerts` → add your new bot as a member.
2. **Send a message the bot can actually hear.** This is the step that catches
   everyone, and my first version of this doc got it wrong.

   Telegram bots run in **privacy mode** by default: inside a group they only
   receive messages that are *commands* or that *@mention them*. A plain
   "hello" is invisible to the bot, so `getUpdates` returns
   `{"ok":true,"result":[]}` forever and it looks broken when it isn't.

   Either works:
   - Send `/start@your_bot_name` in the group, **or**
   - BotFather → `/setprivacy` → pick your bot → **Disable**, then any message
     reaches it.

   (Simplest alternative: skip the group and just DM the bot. Direct messages
   always get through, and the chat id will be a positive number. The downside
   is you cannot add a second person to the thread later.)
3. In a browser, open:
   `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
4. Find `"chat":{"id":-1001234567890`. **Copy that id including the minus sign** —
   group ids are negative and dropping the sign is the other usual reason
   nothing arrives.

If `getUpdates` is still empty, work through it in this order: the bot is not
actually in the group · privacy mode is on and you sent a plain message · you
are using the OLD token in the URL after revoking it.

### 3. Put them in Vercel

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | the token from BotFather |
| `TELEGRAM_ALERT_CHAT_ID` | the chat id, including the leading `-` |

Again — type them into Vercel, don't paste them into chat.

### 4. What you will get

Once set, you get a message when the app crashes for a user. Deliberately
conservative to begin with:

- **The same fault repeating is one message, not sixty.** The helper-log bug
  failed 64 times over two months; that must arrive as one alert. A channel that
  floods gets muted, and a muted channel is no better than the hub you already
  don't check.
- **No customer contact details, ever.** Job numbers and counts only.
- **An alert that fails never breaks the app.** Sending is fire-and-forget with
  a hard timeout, so alerting can never become the outage.

### 5. What is NOT built yet

Being straight with you about the gap between this and what you described:

- **Uptime alerts** — "the site is down" needs something *outside* Vercel to
  notice. Free UptimeRobot pointed at `/api/health`, ~15 minutes to set up, and I
  can do that once you tell me you want an account there.
- **The AI triage loop** — error arrives → agent analyses → proposes a fix → you
  approve or reject in the chat. This is the interesting part and it needs
  designing properly, especially the approval boundary: an agent that can act on
  production from a chat message is exactly the thing an attacker would target,
  so approvals need to be verifiable and scoped. I would rather get the plain
  alerts running first and prove the channel, then build the loop on top.
- **User bug reports into the same channel** — small once the channel exists.

---

## When you are done

Tell me which parts are set and I will verify each one end to end rather than
assuming. If something doesn't arrive, the most common causes are, in order:
the chat id missing its minus sign, variables not scoped to Production, and no
redeploy since adding them.
