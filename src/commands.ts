import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";

const admin = PermissionFlagsBits.ManageGuild;
const mod = PermissionFlagsBits.ModerateMembers;
const commands = [
 new SlashCommandBuilder().setName("help").setDescription("Show bot commands"),
 new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),
 new SlashCommandBuilder().setName("ecosystem").setDescription("Show connected Zuzify services"),
 new SlashCommandBuilder().setName("latestnews").setDescription("Read recent ecosystem announcements"),
 new SlashCommandBuilder().setName("ecosystemannounce").setDescription("Publish an ecosystem-wide announcement")
   .addChannelOption(o=>o.setName("channel").setDescription("Discord destination").setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
   .addStringOption(o=>o.setName("title").setDescription("Headline").setRequired(true).setMaxLength(150))
   .addStringOption(o=>o.setName("message").setDescription("Announcement content").setRequired(true).setMaxLength(1800)),
 new SlashCommandBuilder().setName("about").setDescription("About Zuzify Bot"),
 new SlashCommandBuilder().setName("serverstats").setDescription("Show server statistics"),
 new SlashCommandBuilder().setName("profile").setDescription("Show your or another member's profile").addUserOption(o=>o.setName("user").setDescription("Member to inspect")),
 new SlashCommandBuilder().setName("leaderboard").setDescription("Show the server XP leaderboard"),
 new SlashCommandBuilder().setName("rank").setDescription("Show a member's XP and rank").addUserOption(o=>o.setName("user").setDescription("Member to inspect")),
 new SlashCommandBuilder().setName("setup").setDescription("Create default rank roles and configure the bot"),
 new SlashCommandBuilder().setName("configchannel").setDescription("Set a channel for logs, suggestions, reports or applications")
   .addStringOption(o=>o.setName("purpose").setDescription("What the channel is used for").setRequired(true).addChoices({name:"Logs",value:"log_channel"},{name:"Suggestions",value:"suggestion_channel"},{name:"Reports",value:"report_channel"},{name:"Applications",value:"application_channel"},{name:"Tickets",value:"ticket_channel"}))
   .addChannelOption(o=>o.setName("channel").setDescription("Target text channel").setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement)),
 new SlashCommandBuilder().setName("rankrole").setDescription("Assign a role reward to a level")
   .addIntegerOption(o=>o.setName("level").setDescription("Level required").setRequired(true).setMinValue(1).setMaxValue(1000))
   .addRoleOption(o=>o.setName("role").setDescription("Role to grant at that level").setRequired(true)),
 new SlashCommandBuilder().setName("rankconfig").setDescription("Configure XP gain and rank role rewards")
   .addIntegerOption(o=>o.setName("xp_min").setDescription("Minimum XP per message").setMinValue(1).setMaxValue(100))
   .addIntegerOption(o=>o.setName("xp_max").setDescription("Maximum XP per message").setMinValue(1).setMaxValue(200))
   .addIntegerOption(o=>o.setName("cooldown").setDescription("Seconds between XP awards").setMinValue(5).setMaxValue(3600))
   .addIntegerOption(o=>o.setName("level_step").setDescription("XP needed per level step").setMinValue(50).setMaxValue(5000)),
 new SlashCommandBuilder().setName("ai").setDescription("Ask Zuzify AI").addStringOption(o=>o.setName("prompt").setDescription("What should the AI help with?").setRequired(true).setMaxLength(1500)),
 new SlashCommandBuilder().setName("signup").setDescription("Learn how to register a Zuzify website account"),
 new SlashCommandBuilder().setName("login").setDescription("Securely sign in and link an existing Zuzify account").addStringOption(o=>o.setName("service").setDescription("Website account").setRequired(true).addChoices({name:"PrezzStore",value:"prezzstore"},{name:"Zuzify Socials",value:"zuzifysocials"},{name:"ZuzuOS",value:"zuzuos"},{name:"FastProxy",value:"fastproxy"},{name:"ZuzuLoader",value:"zuzuloader"})),
 new SlashCommandBuilder().setName("suggest").setDescription("Submit a suggestion using a form"),
 new SlashCommandBuilder().setName("report").setDescription("Submit a private report using a form"),
 new SlashCommandBuilder().setName("formpanel").setDescription("Post a panel with clickable form buttons"),
 new SlashCommandBuilder().setName("application").setDescription("Submit a community/team application form"),
 new SlashCommandBuilder().setName("poll").setDescription("Create a poll with two to five options")
   .addStringOption(o=>o.setName("question").setDescription("Poll question").setRequired(true).setMaxLength(200))
   .addStringOption(o=>o.setName("option1").setDescription("First option").setRequired(true).setMaxLength(80))
   .addStringOption(o=>o.setName("option2").setDescription("Second option").setRequired(true).setMaxLength(80))
   .addStringOption(o=>o.setName("option3").setDescription("Optional third option").setMaxLength(80))
   .addStringOption(o=>o.setName("option4").setDescription("Optional fourth option").setMaxLength(80))
   .addStringOption(o=>o.setName("option5").setDescription("Optional fifth option").setMaxLength(80)),
 new SlashCommandBuilder().setName("ticketpanel").setDescription("Post a support ticket panel"),
 new SlashCommandBuilder().setName("suggestionreview").setDescription("Review a suggestion")
   .addStringOption(o=>o.setName("id").setDescription("Suggestion ID").setRequired(true))
   .addStringOption(o=>o.setName("decision").setDescription("Decision").setRequired(true).addChoices({name:"Approve",value:"approved"},{name:"Deny",value:"denied"}))
   .addStringOption(o=>o.setName("note").setDescription("Optional review note").setMaxLength(500)),
 new SlashCommandBuilder().setName("warn").setDescription("Warn a member")
   .addUserOption(o=>o.setName("user").setDescription("Member to warn").setRequired(true))
   .addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500)),
 new SlashCommandBuilder().setName("warnings").setDescription("List a member's warnings")
   .addUserOption(o=>o.setName("user").setDescription("Member").setRequired(true)),
 new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member")
   .addUserOption(o=>o.setName("user").setDescription("Member").setRequired(true))
   .addIntegerOption(o=>o.setName("minutes").setDescription("Duration in minutes").setRequired(true).setMinValue(1).setMaxValue(40320))
   .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(500)),
 new SlashCommandBuilder().setName("untimeout").setDescription("Remove a member timeout")
   .addUserOption(o=>o.setName("user").setDescription("Member").setRequired(true)),
 new SlashCommandBuilder().setName("kick").setDescription("Kick a member")
   .addUserOption(o=>o.setName("user").setDescription("Member").setRequired(true))
   .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(500)),
 new SlashCommandBuilder().setName("ban").setDescription("Ban a member")
   .addUserOption(o=>o.setName("user").setDescription("Member").setRequired(true))
   .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(500)),
 new SlashCommandBuilder().setName("purge").setDescription("Delete recent messages")
   .addIntegerOption(o=>o.setName("amount").setDescription("Number of messages (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)),
 new SlashCommandBuilder().setName("lock").setDescription("Lock this text channel"),
 new SlashCommandBuilder().setName("unlock").setDescription("Unlock this text channel"),
 new SlashCommandBuilder().setName("slowmode").setDescription("Set this channel's slowmode")
   .addIntegerOption(o=>o.setName("seconds").setDescription("Seconds (0 disables)").setRequired(true).setMinValue(0).setMaxValue(21600)),
 new SlashCommandBuilder().setName("nickname").setDescription("Set a member's nickname")
   .addUserOption(o=>o.setName("user").setDescription("Member").setRequired(true))
   .addStringOption(o=>o.setName("nickname").setDescription("New nickname; blank not supported").setRequired(true).setMaxLength(32)),
 new SlashCommandBuilder().setName("roleadd").setDescription("Give a role to a member")
   .addUserOption(o=>o.setName("user").setDescription("Member").setRequired(true))
   .addRoleOption(o=>o.setName("role").setDescription("Role").setRequired(true)),
 new SlashCommandBuilder().setName("roleremove").setDescription("Remove a role from a member")
   .addUserOption(o=>o.setName("user").setDescription("Member").setRequired(true))
   .addRoleOption(o=>o.setName("role").setDescription("Role").setRequired(true)),
 new SlashCommandBuilder().setName("announce").setDescription("Send an announcement to a channel")
   .addChannelOption(o=>o.setName("channel").setDescription("Target text channel").setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
   .addStringOption(o=>o.setName("message").setDescription("Announcement text").setRequired(true).setMaxLength(1800)),

 new SlashCommandBuilder().setName("linkaccount").setDescription("Securely connect an existing Zuzify website account").addStringOption(o=>o.setName("service").setDescription("Which website account to connect").setRequired(true).addChoices({name:"PrezzStore",value:"prezzstore"},{name:"Zuzify Socials",value:"zuzifysocials"},{name:"ZuzuOS",value:"zuzuos"},{name:"FastProxy",value:"fastproxy"},{name:"ZuzuLoader",value:"zuzuloader"})),
 new SlashCommandBuilder().setName("accounts").setDescription("List your privately linked Zuzify accounts"),
 new SlashCommandBuilder().setName("unlinkaccount").setDescription("Disconnect a linked account").addStringOption(o=>o.setName("service").setDescription("Which account to disconnect").setRequired(true).addChoices({name:"PrezzStore",value:"prezzstore"},{name:"Zuzify Socials",value:"zuzifysocials"},{name:"ZuzuOS",value:"zuzuos"},{name:"FastProxy",value:"fastproxy"},{name:"ZuzuLoader",value:"zuzuloader"})),
 new SlashCommandBuilder().setName("accountstats").setDescription("View your private website account statistics").addStringOption(o=>o.setName("service").setDescription("Website").setRequired(true).addChoices({name:"PrezzStore",value:"prezzstore"},{name:"Zuzify Socials",value:"zuzifysocials"},{name:"ZuzuOS",value:"zuzuos"},{name:"FastProxy",value:"fastproxy"},{name:"ZuzuLoader",value:"zuzuloader"})),
 new SlashCommandBuilder().setName("mystats").setDescription("See your combined Discord and Zuzify account overview"),
 new SlashCommandBuilder().setName("botstats").setDescription("Bot uptime and tracked community metrics"),
 new SlashCommandBuilder().setName("version").setDescription("Show the running bot version"),
 new SlashCommandBuilder().setName("changelog").setDescription("Show the latest bot improvements"),
 new SlashCommandBuilder().setName("uptime").setDescription("Check how long the bot has been online"),
 new SlashCommandBuilder().setName("privacy").setDescription("How the bot handles your account information"),
 new SlashCommandBuilder().setName("links").setDescription("Links to official Zuzify websites"),
 new SlashCommandBuilder().setName("userinfo").setDescription("Display public Discord member information").addUserOption(o=>o.setName("user").setDescription("Member")),
 new SlashCommandBuilder().setName("avatar").setDescription("Get a Discord user's profile image").addUserOption(o=>o.setName("user").setDescription("Member")),
 new SlashCommandBuilder().setName("serverinfo").setDescription("Server creation date and community details"),
 new SlashCommandBuilder().setName("roleinfo").setDescription("Inspect a server role").addRoleOption(o=>o.setName("role").setDescription("Role").setRequired(true)),
 new SlashCommandBuilder().setName("channelinfo").setDescription("Inspect the current Discord channel"),
 new SlashCommandBuilder().setName("ticketstatus").setDescription("Check whether your support ticket is open"),
 new SlashCommandBuilder().setName("warningscount").setDescription("Check your number of warnings"),
 new SlashCommandBuilder().setName("recentlogs").setDescription("Show recent audit activity (staff only)"),
 new SlashCommandBuilder().setName("points").setDescription("View points and XP earned from participating in this server").addUserOption(o=>o.setName("user").setDescription("Member to check")),
 new SlashCommandBuilder().setName("pointsboard").setDescription("See top points earners on this server"),
 new SlashCommandBuilder().setName("aistatus").setDescription("Check Zuzify AI provider and configuration status"),
 new SlashCommandBuilder().setName("aistyle").setDescription("Choose Zuzify AI response tone (server managers)")
  .addStringOption(o=>o.setName("tone").setDescription("Response style").setRequired(true).addChoices({name:"Friendly",value:"friendly"},{name:"Professional",value:"professional"},{name:"Playful",value:"playful"},{name:"Study helper",value:"study"})),
 new SlashCommandBuilder().setName("ecosystemstatus").setDescription("Show available Zuzify integrations and linked accounts"),
 new SlashCommandBuilder().setName("pointsguide").setDescription("Explain how to earn points and ranks"),
 new SlashCommandBuilder().setName("applicationreview").setDescription("Approve or decline an application and DM the applicant").addStringOption(o=>o.setName("id").setDescription("Application ID").setRequired(true)).addStringOption(o=>o.setName("decision").setDescription("Decision").setRequired(true).addChoices({name:"Accepted",value:"accepted"},{name:"Declined",value:"declined"})).addStringOption(o=>o.setName("note").setDescription("Optional message").setMaxLength(400)),
 new SlashCommandBuilder().setName("staffrole").setDescription("Assign a Discord role to a staff permission tier").addStringOption(o=>o.setName("tier").setDescription("Tier").setRequired(true).addChoices({name:"Moderator",value:"moderator"},{name:"Community Manager",value:"community_manager"},{name:"Admin",value:"admin"},{name:"Owner",value:"owner"})).addRoleOption(o=>o.setName("role").setDescription("Role").setRequired(true)),
 new SlashCommandBuilder().setName("ownerconfig").setDescription("Owner-only configuration for the entire Zuzify bot")
  .addSubcommand(o=>o.setName("view").setDescription("Show every configurable setting"))
  .addSubcommand(o=>o.setName("set").setDescription("Change a validated bot setting")
   .addStringOption(x=>x.setName("setting").setDescription("Setting to change").setRequired(true).addChoices(
    {name:"AI conversation messages",value:"ai_chat_enabled"},
    {name:"AI channel",value:"ai_chat_channel"},
    {name:"AI inactivity minutes",value:"ai_idle_minutes"},
    {name:"AI interval minutes",value:"ai_interval_minutes"},
    {name:"AI tone",value:"ai_tone"},
    {name:"XP minimum",value:"xp_min"},
    {name:"XP maximum",value:"xp_max"},
    {name:"XP cooldown seconds",value:"xp_cooldown"},
    {name:"XP per level",value:"level_step"},
    {name:"XP earning",value:"xp_enabled"},
    {name:"Member action DMs",value:"moderation_dms"},
    {name:"Applications DMs",value:"application_dms"},
    {name:"Audit log channel",value:"log_channel"},
    {name:"Suggestion channel",value:"suggestion_channel"},
    {name:"Application channel",value:"application_channel"},
    {name:"Report channel",value:"report_channel"},
    {name:"Announcement channel",value:"announcement_channel"}
   ))
   .addStringOption(x=>x.setName("value").setDescription("True/false, valid number, tone, or channel ID").setRequired(true).setMaxLength(100)))
  .addSubcommand(o=>o.setName("reset").setDescription("Restore a setting to its default")
   .addStringOption(x=>x.setName("setting").setDescription("Setting to reset").setRequired(true))),
 new SlashCommandBuilder().setName("aimodel").setDescription("Choose the AI model and inspect current usage settings")
  .addSubcommand(o=>o.setName("view").setDescription("See model, provider and reply limit"))
  .addSubcommand(o=>o.setName("set").setDescription("Owner: select a supported model")
   .addStringOption(x=>x.setName("model").setDescription("Available model").setRequired(true).addChoices(
    {name:"GPT-5 nano (low cost)",value:"gpt-5-nano"},
    {name:"GPT-5 mini",value:"gpt-5-mini"},
    {name:"GPT-4.1 nano (legacy low cost)",value:"gpt-4.1-nano"},
    {name:"GPT-4.1 mini (legacy)",value:"gpt-4.1-mini"}
   ))),
 new SlashCommandBuilder().setName("rememberme").setDescription("Opt in or out of basic AI personalization")
  .addStringOption(x=>x.setName("choice").setDescription("Personalization preference").setRequired(true).addChoices({name:"Enable",value:"on"},{name:"Disable and clear",value:"off"})),
 new SlashCommandBuilder().setName("aiprofile").setDescription("See the information AI can use about your Discord profile"),
 new SlashCommandBuilder().setName("staffperms").setDescription("See staff permission tiers"),
 new SlashCommandBuilder().setName("gifsearch").setDescription("Search Tenor or GIPHY GIFs").addStringOption(o=>o.setName("query").setDescription("Search terms").setRequired(true).setMaxLength(80)).addStringOption(o=>o.setName("provider").setDescription("Search provider").addChoices({name:"GIPHY",value:"giphy"},{name:"Tenor",value:"tenor"})),
 new SlashCommandBuilder().setName("gifsave").setDescription("Save a safe HTTPS GIF URL to your inventory").addStringOption(o=>o.setName("name").setDescription("Name").setRequired(true).setMaxLength(28)).addStringOption(o=>o.setName("url").setDescription("Direct GIF URL").setRequired(true).setMaxLength(450)),
 new SlashCommandBuilder().setName("gifs").setDescription("View your saved GIF inventory"),
 new SlashCommandBuilder().setName("gifuse").setDescription("Post a saved GIF").addStringOption(o=>o.setName("name").setDescription("Saved GIF name").setRequired(true)),
 new SlashCommandBuilder().setName("gifremove").setDescription("Remove a GIF from your inventory").addStringOption(o=>o.setName("name").setDescription("Saved GIF name").setRequired(true)),
 new SlashCommandBuilder().setName("owneralerttest").setDescription("Test the private developer notification system (owner only)"),
].map(data=>({data}));
export { commands };