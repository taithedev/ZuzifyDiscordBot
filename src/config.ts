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
 groqApiKey:process.env.GROQ_API_KEY?.trim()||"", groqModel:process.env.GROQ_MODEL?.trim()||"llama-3.3-70b-versatile",
 ownerIds:(process.env.BOT_OWNER_IDS||"").split(",").map(x=>x.trim()).filter(Boolean),
 status:process.env.BOT_STATUS?.trim()||"Zuzify ecosystem | /help"
};