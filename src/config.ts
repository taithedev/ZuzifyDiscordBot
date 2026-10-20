import "dotenv/config";
function required(name: string): string {
 const value=process.env[name]?.trim();
 if(!value) throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`);
 return value;
}
export const config={
 token:required("DISCORD_TOKEN"), clientId:required("DISCORD_CLIENT_ID"),
 guildId:process.env.DISCORD_GUILD_ID?.trim()||"",
 supabaseUrl:required("SUPABASE_URL"), supabaseServiceKey:required("SUPABASE_SERVICE_ROLE_KEY"),
 openaiApiKey:process.env.OPENAI_API_KEY?.trim()||"", openaiModel:process.env.OPENAI_MODEL?.trim()||"gpt-4.1-mini",
 groqApiKey:process.env.GROQ_API_KEY?.trim()||"", groqModel:process.env.GROQ_MODEL?.trim()||"openai/gpt-oss-120b",
 ownerIds:(process.env.BOT_OWNER_IDS||"").split(",").map(x=>x.trim()).filter(Boolean),
 apiKey:process.env.BOT_API_KEY?.trim()||"", apiPort:Number(process.env.PORT||process.env.BOT_API_PORT||3000),
 aiChatEnabled:process.env.AI_CHAT_ENABLED?.trim().toLowerCase()!=="false",
 aiChatChannelId:process.env.AI_CHAT_CHANNEL_ID?.trim()||"1559366764972871780",
 aiChatIdleMinutes:Math.max(5,Number(process.env.AI_CHAT_IDLE_MINUTES||15)),
 aiChatIntervalMinutes:Math.max(20,Number(process.env.AI_CHAT_INTERVAL_MINUTES||45)),
 botPublicUrl:process.env.BOT_PUBLIC_URL?.trim()||"",
 ecosystemSupabaseUrl:process.env.ECOSYSTEM_SUPABASE_URL?.trim()||"",
 ecosystemServiceKey:process.env.ECOSYSTEM_SUPABASE_SERVICE_ROLE_KEY?.trim()||"",
 ecosystemPublishableKey:process.env.ECOSYSTEM_SUPABASE_PUBLISHABLE_KEY?.trim()||"",
 ownerAlertId:process.env.BOT_OWNER_ALERT_ID?.trim()||"1052713883753775164",
 version:process.env.BOT_VERSION?.trim()||"1.4.0",
 status:process.env.BOT_STATUS?.trim()||"Zuzify ecosystem | /help"
};