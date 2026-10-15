# Zuzify Discord Bot

Standalone Discord bot for the Zuzify ecosystem. It does not depend on ZuzifySocials source code.

## Features
- Slash commands and permission checks
- Supabase persistence for profiles, activity, settings, warnings, tickets, suggestions, polls, forms and XP
- Rank and XP system with optional automatic Discord role rewards
- Modal-based forms for signup, login, suggestions, reports, support tickets and custom applications
- Moderation: warn, timeout, kick, ban, purge, lock/unlock, slowmode, nickname, role add/remove and announce
- Community tools: profile, leaderboard, server stats, polls, tickets, suggestion review and reports
- Optional Groq AI assistant
- Passwords hashed with scrypt; no plain-text password storage

## Setup
1. Copy .env.example to .env and fill in Discord token, client ID, Supabase URL and service-role key. Never commit .env or expose the service key.
2. Run supabase/migrations/001_zuzify_discord_bot.sql in Supabase SQL Editor.
3. In Discord Developer Portal enable Server Members Intent. Invite the bot with bot and applications.commands scopes and only required permissions.
4. Run npm install, npm run check, npm run commands, npm run build, npm start.
5. Add GROQ_API_KEY to the host environment when ready.
6. Deploy on a persistent Node.js worker/service, not static hosting.

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
