# Zuzify Discord Bot

Standalone Discord bot for the Zuzify ecosystem. It does not depend on ZuzifySocials source code.

## Features
- Slash commands and permission checks
- Supabase persistence for profiles, activity, settings, warnings, tickets, suggestions, polls, forms and XP
- Rank and XP system with optional automatic Discord role rewards
- Modal-based forms for signup, login, suggestions, reports, support tickets and custom applications
- Moderation: warn, timeout, kick, ban, purge, lock/unlock, slowmode, nickname, role add/remove and announce
- Community tools: profile, leaderboard, server stats, polls, tickets, suggestion review and reports
- Groq-powered AI assistant plus autonomous conversation starters in a configured general channel
- Private Supabase Storage bucket for attachments, with expiring signed upload URLs
- Protected HTTP API for health, guild statistics, member profiles, and upload URL issuance
- Passwords hashed with scrypt; no plain-text password storage

## Setup
1. Copy .env.example to .env and fill in Discord token, client ID, Supabase URL and service-role key. Never commit .env or expose the service key.
2. The bot database tables are already present in the connected `ZuzifyDiscordBot` Supabase project. The Storage bucket migration `002_zuzify_private_storage.sql` has also been applied. For a fresh project, run migrations `001` then `002`.
3. In Discord Developer Portal enable Server Members Intent. Invite the bot with bot and applications.commands scopes and only required permissions.
4. On Railway, use build command `npm install && npm run build` and start command `npm start`. The start script now registers the slash commands before launching the bot. For instant commands in one test server, set `DISCORD_GUILD_ID` to that server's ID; otherwise commands register globally and may take a while to appear. You can also run `npm run check` before deploying.
5. Set `BOT_API_KEY` to a long random secret and `BOT_API_PORT` (usually the host-provided `PORT`). The API is disabled except for `/health` until `BOT_API_KEY` is set. Add `GROQ_API_KEY` when ready.
6. Set AI_CHAT_CHANNEL_ID to your general channel ID (default: 1559366764972871780). The bot posts a conversation starter after 15 quiet minutes, then no more often than every 45 minutes. Set AI_CHAT_ENABLED=false to disable it. Ensure the bot has View Channel and Send Messages permissions there.
7. Deploy on a persistent Node.js worker/service, not static hosting.

## First-time server setup
- /setup creates default rank roles and configures logging.
- /rankconfig sets XP settings and /rankrole maps a level to a Discord role.
- /configchannel configures the log, suggestion, report, application, and ticket channels.
- /formpanel posts buttons that open Discord modal forms.
- /ticketpanel posts a support ticket panel.
- /help lists command groups.

## Security and behavior
- Signup/login are optional bot-local accounts, not Discord authentication. Never reuse a Discord password.
- Rank roles are configured per server. Admins must run setup before rank role rewards can be assigned.
- This repository is not hosted automatically by creating it on GitHub; configure a persistent Node host.

## HTTP API

The bot runs a small HTTP server in the same process as the Discord client.

- `GET /health` — public liveness check.
- `GET /api/v1/guilds/:guildId/stats` — counts of tracked members, events, open tickets and submitted forms.
- `GET /api/v1/guilds/:guildId/members/:userId` — a stored member profile.
- `POST /api/v1/storage/upload-url` — create a time-limited upload URL for the private `zuzify-private` bucket.

Every `/api/v1/*` route requires `Authorization: Bearer YOUR_BOT_API_KEY`. Keep this key on trusted servers; do not place it in browser JavaScript or a public client. Example:

```bash
curl -H "Authorization: Bearer $BOT_API_KEY" \
  "http://localhost:3000/api/v1/guilds/YOUR_GUILD_ID/stats"
```

Request an upload URL:

```bash
curl -X POST "http://localhost:3000/api/v1/storage/upload-url" \
  -H "Authorization: Bearer $BOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"guildId":"YOUR_GUILD_ID","userId":"YOUR_DISCORD_USER_ID","filename":"image.png","contentType":"image/png"}'
```

The response includes the private bucket name, object path, upload token, absolute signed URL and content type. Signed URLs expire; do not publish them. Allowed uploads are PNG, JPEG, WebP, GIF, PDF, plain text and JSON, up to 10 MB. Upload URLs should only be issued to trusted backend callers.

## Ecosystem announcements (new)

This repo now supports **/ecosystem**, **/latestnews**, and **/ecosystemannounce**. The new `public.bot_announcements` table stores messages for all Zuzify services. Run the SQL migration in a fresh Supabase project, or use the connected database where it was applied.

1. In the bot host's private environment, set `SUPABASE_URL=https://wfqudstuncdldsvxqveu.supabase.co` and `SUPABASE_SERVICE_ROLE_KEY` to the **secret** service role key from this same project. The URL is not a secret; the key is. Do **not** publish the key in the repository or either website.
2. Set `BOT_API_KEY` to a random server-side secret. It protects all `/api/v1/*` routes. Restart/redeploy the bot host after changing variables.
3. Use `/ecosystemannounce` (requires Manage Server) to post to Discord and store the announcement in Supabase. The destination becomes the permitted announcement channel for authenticated API requests in that guild.
4. A trusted ZuzuOS or Zuzify Socials **server** may call `GET /api/v1/announcements?limit=20` or `POST /api/v1/announcements` with `Authorization: Bearer BOT_API_KEY`. Example POST JSON: `{"guildId":"YOUR_GUILD_ID","source":"zuzuos","title":"Update","body":"A new update is live.","channelId":"YOUR_CONFIGURED_ANNOUNCEMENT_CHANNEL_ID"}`.
5. To show news on the websites, create a server-side integration or a narrow read-only endpoint that forwards the latest approved announcements. The current bot API requires a secret bearer token; never call it directly from public browser JavaScript. Web display widgets are **not** automatically installed on the websites by these bot-repository changes.

An announcement can be saved without sending to Discord by omitting `channelId`. Discord and database writes are sequential; if Discord succeeds and database storage fails, the operation reports an error and may require reconciliation. API clients should avoid blind retries that could duplicate posts.

### Health and verification

`GET /health` checks the HTTP process only, not its database access. Use `/latestnews` or a protected announcement query to test the actual Supabase connection. Deployment depends on the external bot host pulling the new GitHub commit; a GitHub commit alone does not guarantee the running bot is updated.
