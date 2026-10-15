import {createClient} from "@supabase/supabase-js";
import {config} from "./config.js";
export const db=createClient(config.supabaseUrl,config.supabaseServiceKey,{auth:{persistSession:false,autoRefreshToken:false}});
export async function logEvent(guildId:string,userId:string|null,type:string,data:Record<string,unknown>={}) {
 const {error}=await db.from("bot_events").insert({guild_id:guildId,discord_user_id:userId,event_type:type,data});
 if(error) console.error("Event log failed:",error.message);
}
export async function touchMember(guildId:string,user:{id:string;username?:string;globalName?:string|null;avatarURL?:()=>string|null}) {
 const {error}=await db.from("bot_members").upsert({guild_id:guildId,discord_user_id:user.id,username:user.username??"unknown",display_name:user.globalName??user.username??"unknown",avatar_url:user.avatarURL?.()??null,last_seen_at:new Date().toISOString()},{onConflict:"guild_id,discord_user_id"});
 if(error) console.error("Member sync failed:",error.message);
}
export async function getSetting(guildId:string,key:string):Promise<string|null>{
 const {data}=await db.from("bot_settings").select("value").eq("guild_id",guildId).eq("key",key).maybeSingle();
 return typeof data?.value==="string"?data.value:null;
}
export async function setSetting(guildId:string,key:string,value:string){
 const {error}=await db.from("bot_settings").upsert({guild_id:guildId,key,value},{onConflict:"guild_id,key"});
 if(error) throw new Error(error.message);
}