import {config} from "./config.js";

const ownerId = config.ownerAlertId;
let dmChannelId: string | null = null;
let lastAlertAt = 0;
let queued: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
function clean(value:string){return value.replace(/[`@]/g,"").slice(0,550);}
async function discord(endpoint:string,body:object){
 const response=await fetch("https://discord.com/api/v10"+endpoint,{
  method:"POST",
  headers:{"Authorization":"Bot "+config.token,"Content-Type":"application/json"},
  body:JSON.stringify(body),signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw new Error("Discord owner-alert API returned "+response.status);
 return response.json() as Promise<{id:string}>;
}
async function send(content:string){
 if(!ownerId)return;
 if(!dmChannelId){
  const dm=await discord("/users/@me/channels",{recipient_id:ownerId});
  dmChannelId=dm.id;
 }
 try{
  await discord("/channels/"+dmChannelId+"/messages",{
   content:content.slice(0,1900),
   allowed_mentions:{parse:[]}
  });
 }catch(error){
  dmChannelId=null;
  throw error;
 }
}
async function flush(){
 timer=null;
 if(!queued.length)return;
 const lines=queued.splice(0,12);
 if(queued.length>100)queued=queued.slice(-100);
 try{await send("**Zuzify bot activity**\n"+lines.join("\n").slice(0,1700));}
 catch(error){console.error("Owner DM delivery unavailable:",error instanceof Error?error.message:"Unknown error");}
 lastAlertAt=Date.now();
 if(queued.length)timer=setTimeout(()=>void flush(),60_000);
}
export function queueOwnerLog(kind:string,guildId?:string,userId?:string|null){
 if(!ownerId)return;
 queued.push("• "+clean(kind)+(guildId?" — guild "+guildId:"")+(userId?" · user "+userId:""));
 if(queued.length>120)queued=queued.slice(-120);
 if(!timer)timer=setTimeout(()=>void flush(),Math.max(5000,60_000-(Date.now()-lastAlertAt)));
}
export async function urgentOwnerAlert(title:string,details:string){
 if(!ownerId)return;
 try{await send("**"+clean(title)+"**\n"+clean(details));}
 catch(error){console.error("Owner DM delivery unavailable:",error instanceof Error?error.message:"Unknown error");}
}
