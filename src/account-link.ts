import {createHash, randomBytes} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {config} from "./config.js";
import {db as botDb} from "./db.js";

export const services = ["prezzstore","zuzifysocials","zuzuos","fastproxy","zuzuloader"] as const;
export type Service = typeof services[number];
export const serviceNames: Record<Service,string> = {
 prezzstore:"PrezzStore",zuzifysocials:"Zuzify Socials",zuzuos:"ZuzuOS",fastproxy:"FastProxy",zuzuloader:"ZuzuLoader"
};
export const isService = (value:string):value is Service => services.some(s=>s===value);

const ecosystemUrl = config.ecosystemSupabaseUrl || config.supabaseUrl;
const ecosystemServiceKey = config.ecosystemServiceKey || (ecosystemUrl===config.supabaseUrl ? config.supabaseServiceKey : "");
export const ecosystemDb = ecosystemServiceKey
 ? createClient(ecosystemUrl,ecosystemServiceKey,{auth:{persistSession:false,autoRefreshToken:false}})
 : null;
const authClient = config.ecosystemPublishableKey
 ? createClient(ecosystemUrl, config.ecosystemPublishableKey, {auth:{persistSession:false,autoRefreshToken:false}})
 : null;
export function linkingReady():boolean {
 return Boolean(authClient && config.botPublicUrl && /^https:\/\//.test(config.botPublicUrl));
}
function database(){
 if(!ecosystemDb) throw new Error("Account linking needs ECOSYSTEM_SUPABASE_SERVICE_ROLE_KEY.");
 return ecosystemDb;
}
function hash(code:string){return createHash("sha256").update(code).digest("hex");}
function checked<T>(data:T,error:{message:string}|null):T{
 if(error)throw new Error(error.message);
 return data;
}
const challengeScope="discord_account_challenges";
const linkScope="discord_ecosystem_account_links";
const recentChallenges=new Map<string,number[]>();
export async function createChallenge(discordId:string,service:Service){
 if(!linkingReady()) throw new Error("Account linking requires ECOSYSTEM_SUPABASE_PUBLISHABLE_KEY and BOT_PUBLIC_URL on Railway.");
 const now=Date.now();
 const recent=(recentChallenges.get(discordId)||[]).filter(timestamp=>now-timestamp<60_000);
 if(recent.length>=3) throw new Error("Too many link requests. Try again in one minute.");
 recent.push(now);
 recentChallenges.set(discordId,recent);
 const code=randomBytes(32).toString("hex");
 const entry=JSON.stringify({discordId,service,expiresAt:now+600_000});
 const {error}=await botDb.from("bot_settings").upsert({guild_id:challengeScope,key:hash(code),value:entry},{onConflict:"guild_id,key"});
 checked(null,error);
 return config.botPublicUrl.replace(/\/$/,"")+"/link?code="+encodeURIComponent(code);
}
export async function consumeChallenge(code:string,accessToken:string){
 if(!/^[0-9a-f]{64}$/.test(code)||accessToken.length<20||accessToken.length>8192||!authClient)throw new Error("Invalid account-link request.");
 const {data:userData,error:userError}=await authClient.auth.getUser(accessToken);
 if(userError||!userData.user||userData.user.is_anonymous)throw new Error("Account verification failed. Sign in with your existing Zuzify credentials.");
 const key=hash(code);
 const {data:row,error:readError}=await botDb.from("bot_settings").select("value").eq("guild_id",challengeScope).eq("key",key).maybeSingle();
 checked(row,readError);
 if(!row)throw new Error("Link expired or already used. Request another /linkaccount link.");
 let challenge:{discordId:string;service:string;expiresAt:number};
 try{challenge=JSON.parse(String(row.value));}catch{throw new Error("Invalid link challenge.");}
 if(!/^\d{15,25}$/.test(challenge.discordId)||!isService(challenge.service)||!Number.isFinite(challenge.expiresAt)||challenge.expiresAt<Date.now())throw new Error("Link expired or invalid. Request a fresh /linkaccount link.");
 const {data:consumed,error:consumeError}=await botDb.from("bot_settings").delete().eq("guild_id",challengeScope).eq("key",key).eq("value",row.value).select("id").maybeSingle();
 checked(consumed,consumeError);
 if(!consumed)throw new Error("This link has already been used.");
 // Store only the verified account UUID; do not store the password or OAuth session.
 const {error:linkError}=await botDb.from("bot_settings").upsert({
  guild_id:linkScope,key:challenge.discordId+":"+challenge.service,value:userData.user.id
 },{onConflict:"guild_id,key"});
 checked(null,linkError);
 return {service:challenge.service};
}
export async function linkedAccounts(discordId:string){
 const {data,error}=await botDb.from("bot_settings").select("key,value,updated_at")
  .eq("guild_id",linkScope).like("key",discordId+":%").order("updated_at",{ascending:true});
 checked(data,error);
 return (data||[]).map(row=>({service:String(row.key).split(":")[1],user_id:row.value,linked_at:row.updated_at}));
}
export async function unlinkAccount(discordId:string,service:Service){
 const {data,error}=await botDb.from("bot_settings").delete()
  .eq("guild_id",linkScope).eq("key",discordId+":"+service).select("id").maybeSingle();
 checked(data,error);
 return Boolean(data);
}
async function count(table:string,key:string,id:string,additional?:{field:string,value:string}){
 if(!ecosystemDb)return null;
 let q=database().from(table).select("*",{head:true,count:"exact"}).eq(key,id);
 if(additional)q=q.eq(additional.field,additional.value);
 const {count,error}=await q;
 if(error){console.error("Account stats query failed",table,error.message);return null;}
 return count??0;
}
async function nameFor(service:Service,userId:string):Promise<string|null>{
 const map:Record<Service,{table:string,key:string,column:string}>={
  prezzstore:{table:"prezzstore_user_profiles",key:"user_id",column:"display_name"},
  zuzuos:{table:"zuzuos_profiles",key:"id",column:"display_name"},
  fastproxy:{table:"fastproxy_profiles",key:"user_id",column:"display_name"},
  zuzuloader:{table:"zuzuloader_roles",key:"user_id",column:"role"},
  zuzifysocials:{table:"zuzify_members",key:"user_id",column:"user_id"}
 };
 if(!ecosystemDb)return null;
 const m=map[service];
 const {data,error}=await database().from(m.table).select(m.column).eq(m.key,userId).limit(1).maybeSingle();
 if(error)return null;
 if(!data)return null;
 const value=(data as unknown as Record<string,unknown>)[m.column];
 return typeof value==="string"&&m.column!=="user_id"?value.slice(0,80):null;
}
export async function accountStats(discordId:string,service:Service){
 const links=await linkedAccounts(discordId);
 const link=links.find(r=>r.service===service);
 if(!link)return null;
 const userId=String(link.user_id);
 const displayName=await nameFor(service,userId);
 const metrics:Record<string,number|null>={};
 if(service==="prezzstore"){
  metrics.stores=await count("prezzstore_stores","owner_id",userId);
  metrics.purchases=await count("prezzstore_orders","buyer_id",userId);
  metrics.sales=await count("prezzstore_orders","seller_id",userId,{field:"status",value:"paid"});
 }else if(service==="fastproxy"){
  metrics.bookmarks=await count("fastproxy_bookmarks","user_id",userId);
  metrics.historyEntries=await count("fastproxy_history","user_id",userId);
 }else if(service==="zuzuos"){
  metrics.customApps=await count("zuzuos_custom_apps","user_id",userId);
  metrics.messagesSent=await count("zuzuos_messages","sender_id",userId);
 }else{
  metrics.roomsJoined=await count("zuzify_members","user_id",userId);
  metrics.messagesSent=await count("zuzify_messages","sender_id",userId);
 }
 return {service,displayName,linkedAt:link.linked_at,metrics,statsReady:Boolean(ecosystemDb)};
}
export function linkPage():string{
 // No user-supplied content is embedded in the document. Authentication goes directly
 // from the user's browser to Supabase Auth; no password reaches this bot's API.
 const settings=JSON.stringify({
  supabaseUrl:ecosystemUrl,publishableKey:config.ecosystemPublishableKey,
  ready:linkingReady()
 }).replace(/</g,"\\u003c");
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <title>Connect Zuzify account</title><style>html{color-scheme:dark}body{font:16px system-ui;background:#09090b;color:#fafafa;min-height:100vh;display:grid;place-items:center;margin:0}
 main{background:#141418;padding:32px;border:1px solid #323238;border-radius:18px;max-width:390px;width:calc(100% - 64px)}
 h1{font-size:24px}p{line-height:1.5;color:#bcbcc4}input,button{display:block;box-sizing:border-box;width:100%;padding:13px;margin-top:12px;border-radius:9px;font:inherit}
 input{background:#24242a;color:white;border:1px solid #44444a}button{background:white;color:#080808;border:0;font-weight:700;cursor:pointer}button:disabled{opacity:.5}
 #status{white-space:pre-wrap}small{color:#ababaf}</style></head>
 <body><main><h1>Connect your Zuzify account</h1><p>This secure one-time link connects an existing account to your Discord user. Use the email and password for the Zuzify site you selected. Do not enter passwords in Discord.</p>
 <form id="form"><input type="email" id="email" autocomplete="username" placeholder="Account email" required>
 <input type="password" id="password" autocomplete="current-password" placeholder="Account password" required>
 <button id="submit">Verify and connect</button></form><p id="status" role="status"></p>
 <small>Your password is sent directly to Supabase Auth, not stored by the Discord bot. Link requests expire after 10 minutes.</small></main>
 <script>const settings=${settings};const form=document.getElementById("form");const status=document.getElementById("status");
 const code=new URLSearchParams(location.search).get("code");if(!code||!settings.ready){form.hidden=true;status.textContent="Linking is not available. Request a new link from /linkaccount or contact an administrator.";}
 form.addEventListener("submit",async event=>{event.preventDefault();const button=document.getElementById("submit");button.disabled=true;status.textContent="Verifying account...";
 try{const email=document.getElementById("email").value.trim();const password=document.getElementById("password").value;
 const auth=await fetch(settings.supabaseUrl.replace(/\\/$/,"")+"/auth/v1/token?grant_type=password",{
  method:"POST",headers:{"Content-Type":"application/json","apikey":settings.publishableKey},body:JSON.stringify({email,password})});
 const result=await auth.json();if(!auth.ok||!result.access_token)throw new Error("Sign-in failed. Check your credentials and use an existing Zuzify account.");
 const response=await fetch("/api/v1/link/complete",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+result.access_token},body:JSON.stringify({code})});
 const linked=await response.json();if(!response.ok)throw new Error(linked.error||"Account connection failed.");
 form.reset();form.hidden=true;history.replaceState(null,"","/link");status.textContent="Account connected. Return to Discord and use /accounts or /accountstats.";
 }catch(err){status.textContent=err instanceof Error?err.message:"Could not connect account.";}finally{button.disabled=false;}});
 </script></body></html>`;
}
