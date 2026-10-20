import {db} from "./db.js";
import {config} from "./config.js";
import {urgentOwnerAlert} from "./owner-alerts.js";

export const ecosystemSites=["zuzuos","zuzifysocials"] as const;
export async function latestAnnouncements(limit=20) {
 const {data,error}=await db.from("bot_announcements").select("id,guild_id,source,title,body,created_at").eq("status","published").order("created_at",{ascending:false}).limit(Math.min(Math.max(limit,1),50));
 if(error) throw new Error(error.message);
 return data??[];
}
export async function publishAnnouncement(input:{guildId:string;title:string;body:string;source:"discord"|"zuzuos"|"zuzifysocials"|"api";createdBy?:string;channelId?:string}) {
 const {guildId,title,body,source,createdBy,channelId}=input;
 if(!/^\d{15,25}$/.test(guildId)||!title.trim()||title.length>150||!body.trim()||body.length>1800) throw new Error("Invalid announcement input");
 let messageId:string|undefined;
 if(channelId){
  if(!/^\d{15,25}$/.test(channelId)) throw new Error("Invalid channel ID");
  const response=await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`,{
   method:"POST",
   headers:{"Authorization":`Bot ${config.token}`,"Content-Type":"application/json"},
   body:JSON.stringify({embeds:[{title:title.trim(),description:body.trim(),color:0x7458e8,timestamp:new Date().toISOString()}],allowed_mentions:{parse:[]}})
  });
  if(!response.ok) throw new Error(`Discord delivery failed (${response.status}): ${(await response.text()).slice(0,200)}`);
  const message=await response.json() as {id:string};messageId=message.id;
 }
 const {data,error}=await db.from("bot_announcements").insert({guild_id:guildId,source,title:title.trim(),body:body.trim(),created_by:createdBy??null,discord_channel_id:channelId??null,discord_message_id:messageId??null}).select("id,created_at").single();
 if(error) throw new Error(`Announcement storage failed: ${error.message}`);
 void urgentOwnerAlert("Zuzify ecosystem update",title.trim()+"\n"+source+" · "+guildId+"\n"+body.slice(0,500)).catch(()=>null);
 return {...data,discordMessageId:messageId??null};
}
