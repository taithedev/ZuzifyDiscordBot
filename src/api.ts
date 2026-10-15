import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import {randomUUID,timingSafeEqual} from "node:crypto";
import {config} from "./config.js";
import {db} from "./db.js";

const bucket="zuzify-private";
const allowedTypes=new Set(["image/png","image/jpeg","image/webp","image/gif","application/pdf","text/plain","application/json"]);
function send(res:ServerResponse,status:number,payload:unknown){
 res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});
 res.end(JSON.stringify(payload));
}
function authorized(req:IncomingMessage){
 if(!config.apiKey) return false;
 const value=req.headers.authorization?.startsWith("Bearer ")?req.headers.authorization.slice(7):"";
 const a=Buffer.from(value),b=Buffer.from(config.apiKey);
 return a.length===b.length&&timingSafeEqual(a,b);
}
async function readJson(req:IncomingMessage):Promise<Record<string,unknown>>{
 const chunks:Buffer[]=[];let size=0;
 for await(const part of req){const chunk=Buffer.isBuffer(part)?part:Buffer.from(part);size+=chunk.length;if(size>16384)throw new Error("Request body too large");chunks.push(chunk);}
 const parsed=JSON.parse(Buffer.concat(chunks).toString("utf8"));
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("JSON object required");
 return parsed as Record<string,unknown>;
}
export function startApi(){
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url||"/","http://localhost");
  if(req.method==="GET"&&url.pathname==="/health") return send(res,200,{ok:true,service:"zuzify-discord-bot",time:new Date().toISOString()});
  if(!url.pathname.startsWith("/api/v1/")) return send(res,404,{error:"Not found"});
  if(!authorized(req)) return send(res,401,{error:"Missing or invalid API bearer token"});
  try{
   const parts=url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
   if(req.method==="GET"&&parts.length===5&&parts[2]==="guilds"&&parts[4]==="stats"){
    const guildId=parts[3];
    const [{count:members},{count:events},{count:openTickets},{count:forms}] = await Promise.all([
     db.from("bot_members").select("id",{count:"exact",head:true}).eq("guild_id",guildId),
     db.from("bot_events").select("id",{count:"exact",head:true}).eq("guild_id",guildId),
     db.from("bot_tickets").select("id",{count:"exact",head:true}).eq("guild_id",guildId).eq("status","open"),
     db.from("bot_forms").select("id",{count:"exact",head:true}).eq("guild_id",guildId).eq("status","submitted")
    ]);
    return send(res,200,{guildId,trackedMembers:members??0,events:events??0,openTickets:openTickets??0,pendingForms:forms??0});
   }
   if(req.method==="GET"&&parts.length===6&&parts[2]==="guilds"&&parts[4]==="members"){
    const guildId=parts[3],userId=parts[5];
    const {data,error}=await db.from("bot_members").select("guild_id,discord_user_id,username,display_name,avatar_url,first_seen_at,last_seen_at,message_count,xp,level").eq("guild_id",guildId).eq("discord_user_id",userId).maybeSingle();
    if(error) return send(res,500,{error:"Database query failed"});
    if(!data) return send(res,404,{error:"Member not found"});
    return send(res,200,{member:data});
   }
   if(req.method==="POST"&&parts.length===4&&parts[2]==="storage"&&parts[3]==="upload-url"){
    const body=await readJson(req);
    const guildId=String(body.guildId||""),userId=String(body.userId||""),filename=String(body.filename||""),contentType=String(body.contentType||"");
    if(!/^\d{5,25}$/.test(guildId)||!/^\d{5,25}$/.test(userId)) return send(res,400,{error:"guildId and userId must be Discord snowflake IDs"});
    if(!filename||filename.length>160||filename.includes("/")||filename.includes("\\")||filename==="."||filename==="..") return send(res,400,{error:"Invalid filename"});
    if(!allowedTypes.has(contentType)) return send(res,415,{error:"File type not allowed"});
    const ext=filename.includes(".")?filename.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,10):"bin";
    const path=`${guildId}/${userId}/${randomUUID()}.${ext}`;
    const {data,error}=await db.storage.from(bucket).createSignedUploadUrl(path);
    if(error){console.error("Storage signed upload URL failed:",error.message);return send(res,500,{error:"Could not create upload URL. Check Storage bucket setup."});}
    const signedUrl=data.signedUrl.startsWith("http")?data.signedUrl:`${config.supabaseUrl.replace(/\\/$/,"")}/storage/v1${data.signedUrl.startsWith("/")?data.signedUrl:`/${data.signedUrl}`}`;
    return send(res,201,{bucket,path,token:data.token,signedUrl,contentType,expiresInSeconds:7200});
   }
   return send(res,404,{error:"Endpoint not found"});
  }catch(error){
   console.error("API request error:",error);
   return send(res,400,{error:error instanceof Error?error.message:"Invalid request"});
  }
 });
 server.listen(config.apiPort,"0.0.0.0",()=>console.log(`Zuzify API listening on port ${config.apiPort}`));
 return server;
}
