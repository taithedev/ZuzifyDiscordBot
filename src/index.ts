import {
 Client, GatewayIntentBits, Events, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
 ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, type Interaction,
 type ChatInputCommandInteraction, type ModalSubmitInteraction, type ButtonInteraction, type GuildMember, type TextChannel
} from "discord.js";
import {config} from "./config.js";
import {db,logEvent,touchMember,getSetting,setSetting} from "./db.js";
import {askGroq,aiProvider} from "./ai.js";
import {commands} from "./commands.js";
import {startApi} from "./api.js";
import {latestAnnouncements,publishAnnouncement} from "./ecosystem.js";
import {createChallenge,linkedAccounts,unlinkAccount,accountStats,isService,serviceNames,linkingReady} from "./account-link.js";
import {urgentOwnerAlert,queueOwnerLog} from "./owner-alerts.js";
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages]});
const colors={brand:0x7458e8,good:0x35b779,bad:0xe05252};
const embed=(title:string,description:string,color=colors.brand)=>new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
const isOwner=(id:string)=>config.ownerIds.includes(id);
async function reply(i:ChatInputCommandInteraction|ButtonInteraction|ModalSubmitInteraction,text:string,ephemeral=true){
 if(i.deferred||i.replied) await i.followUp({content:text,ephemeral});
 else await i.reply({content:text,ephemeral});
}
async function openModal(i:ChatInputCommandInteraction|ButtonInteraction,id:string,title:string,fields:Array<{id:string;label:string;style?:TextInputStyle;required?:boolean;placeholder?:string;max?:number}>){
 const modal=new ModalBuilder().setCustomId(id).setTitle(title);
 for(const f of fields){
  const input=new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style??TextInputStyle.Short).setRequired(f.required??true);
  if(f.placeholder) input.setPlaceholder(f.placeholder);
  if(f.max) input.setMaxLength(f.max);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
 }
 await i.showModal(modal);
}
async function saveForm(i:ModalSubmitInteraction,type:string,title:string,answers:Record<string,string>){
 if(!i.guildId) return reply(i,"Use this form inside a server.");
 const {data:submission,error}=await db.from("bot_forms").insert({guild_id:i.guildId,discord_user_id:i.user.id,form_type:type,title,answers}).select("id").single();
 if(error) throw new Error(error.message);
 await logEvent(i.guildId,i.user.id,"form_submitted",{type,title});
 const target=await getSetting(i.guildId,type+"_channel");
 if(target&&i.guild){
  const ch=await i.guild.channels.fetch(target).catch(()=>null);
  if(ch?.isTextBased()&&"send" in ch){
   const e=embed(title,Object.entries(answers).map(([k,v])=>`**${k}:** ${v}`).join("\n").slice(0,4000)).addFields({name:"Submitted by",value:`${i.user.tag} (${i.user.id})`});
   await (ch as TextChannel).send({content:"Application/form ID: "+(submission?.id||"unknown"),embeds:[e]}).catch(()=>null);
  }
 }
 await reply(i,`Your ${type} form was submitted privately. Reference ID: ${submission?.id||"unknown"}`);
}
async function createTicket(i:ButtonInteraction){
 if(!i.guild||!i.guildId) return reply(i,"Tickets must be opened inside a server.");
 await i.deferReply({ephemeral:true});
 const existing=await db.from("bot_tickets").select("id,channel_id").eq("guild_id",i.guildId).eq("discord_user_id",i.user.id).eq("status","open").maybeSingle();
 if(existing.data?.channel_id){
  const ch=await i.guild.channels.fetch(existing.data.channel_id).catch(()=>null);
  if(ch) return i.editReply(`You already have an open ticket: <#${ch.id}>`);
 }
 const safe=i.user.username.toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,18)||"member";
 const channel=await i.guild.channels.create({
  name:`ticket-${safe}`,type:ChannelType.GuildText,
  permissionOverwrites:[
   {id:i.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
   {id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},
   {id:client.user!.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ReadMessageHistory]},
   ...i.guild.roles.cache.filter(role=>role.id!==i.guild!.roles.everyone.id&&role.permissions.has(PermissionFlagsBits.ManageChannels)).map(role=>({id:role.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}))
  ]
 }).catch(async err=>{console.error(err);await i.editReply("I couldn't create a ticket channel. Check Manage Channels permission.");return null;});
 if(!channel) return;
 const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("ticket:close").setLabel("Close ticket").setStyle(ButtonStyle.Danger));
 await channel.send({content:`<@\u200b${i.user.id}>`.replace("<@\u200b","<@"),embeds:[embed("Zuzify Support Ticket","Describe your issue here. Staff will reply in this private channel.")],components:[row]});
 const {error}=await db.from("bot_tickets").insert({guild_id:i.guildId,channel_id:channel.id,discord_user_id:i.user.id,subject:"Support ticket",details:"Opened from ticket panel"});
 if(error) console.error("Ticket database save failed:",error.message);
 await logEvent(i.guildId,i.user.id,"ticket_opened",{channel_id:channel.id});
 await i.editReply(`Ticket created: <#${channel.id}>`);
}
async function setupRanks(guild:NonNullable<ChatInputCommandInteraction["guild"]>){
 const defaults=[{level:5,name:"Zuzify Member"},{level:10,name:"Zuzify Regular"},{level:20,name:"Zuzify Elite"},{level:35,name:"Zuzify Legend"}];
 for(const rank of defaults){
  let role=guild.roles.cache.find(r=>r.name===rank.name);
  if(!role) role=await guild.roles.create({name:rank.name,reason:"Zuzify bot default rank role"}).catch(()=>undefined);
  if(role){await setSetting(guild.id,`rank_role_${rank.level}`,role.id);await db.from("bot_rank_roles").upsert({guild_id:guild.id,level:rank.level,role_id:role.id},{onConflict:"guild_id,level"});}
 }
 await setSetting(guild.id,"xp_min",await getSetting(guild.id,"xp_min")||"8");
 await setSetting(guild.id,"xp_max",await getSetting(guild.id,"xp_max")||"15");
 await setSetting(guild.id,"xp_cooldown",await getSetting(guild.id,"xp_cooldown")||"45");
 await setSetting(guild.id,"level_step",await getSetting(guild.id,"level_step")||"100");
}
async function memberData(guildId:string,userId:string){
 const {data,error}=await db.from("bot_members").select("*").eq("guild_id",guildId).eq("discord_user_id",userId).maybeSingle();
 if(error) throw new Error(error.message);
 return data;
}
const lastHumanMessageAt=new Map<string,number>();
let lastAutonomousPostAt=0;

async function autonomousChatTick(){
 if(!config.aiChatEnabled||!(config.openaiApiKey||config.groqApiKey)||!config.aiChatChannelId) return;
 const now=Date.now();
 if(now-lastAutonomousPostAt<config.aiChatIntervalMinutes*60_000) return;
 const channel=await client.channels.fetch(config.aiChatChannelId).catch(error=>{
  console.error("Autonomous AI channel lookup failed:",error instanceof Error?error.message:error);
  return null;
 });
 if(!channel?.isTextBased()||!("send" in channel)){
  console.error("Autonomous AI channel is missing or is not a sendable text channel:",config.aiChatChannelId);
  return;
 }
 const lastHuman=lastHumanMessageAt.get(config.aiChatChannelId)??now;
 if(now-lastHuman<config.aiChatIdleMinutes*60_000) return;
 lastAutonomousPostAt=now;
 const prompt="Write one short, natural Discord message to start a conversation in the Zuzify community while the chat is quiet. Make it feel like a real community member, not a system announcement. Vary the topic between technology, games, creative projects, app ideas, and light everyday conversation. Use at most 2 sentences, preferably one open-ended question. You are an AI community assistant; avoid pretending you are a human. Do not mention inactivity or schedules. Do not use @everyone/@here, mass mentions, or markdown headings. Return only the message.";
 const answer=(await askGroq(prompt)).trim();
 const failures=["AI is not configured","Groq rejected","Groq rate limit","Groq is temporarily","Groq returned","Zuzify AI could not","The AI provider timed out","The configured Groq model"];
 if(!answer||failures.some(marker=>answer.includes(marker))){
  console.error("Autonomous AI skipped because the provider did not return a usable message.");
  lastAutonomousPostAt=0;
  return;
 }
 try{
  await (channel as TextChannel).send({content:answer.slice(0,1800),allowedMentions:{parse:[]}});
  console.log("Autonomous AI conversation starter sent to channel",config.aiChatChannelId);
 }catch(error){
  console.error("Autonomous AI send failed; check View Channel and Send Messages permissions:",error);
  lastAutonomousPostAt=0;
 }
}

async function handleCommand(i:ChatInputCommandInteraction){
 const name=i.commandName;
 const guild=i.guild;
 if(guild) void touchMember(guild.id,i.user).catch(error=>console.error("Member tracking failed:",error));

 const tierPower:{[key:string]:number}={member:0,moderator:1,community_manager:2,admin:3,owner:4};
 let tier="member";
 if(guild){
  if(isOwner(i.user.id)||i.user.id===guild.ownerId)tier="owner";
  else{
   const staff=await guild.members.fetch(i.user.id).catch(()=>null);
   if(staff)for(const option of ["owner","admin","community_manager","moderator"]){
    const roleId=await getSetting(guild.id,"staff_role_"+option);
    if(roleId&&staff.roles.cache.has(roleId)){tier=option;break;}
   }
  }
 }
 const roleActions:{[key:string]:string[]}={
  moderator:["warn","warnings","timeout","untimeout","purge"],
  community_manager:["suggestionreview","applicationreview","announce","formpanel","ticketpanel"],
  admin:["setup","configchannel","rankrole","rankconfig","kick","ban","lock","unlock","slowmode","nickname","roleadd","roleremove","aistyle","ecosystemannounce","recentlogs"],
  owner:["staffrole","owneralerttest"]
 };
 const requiredTier=Object.entries(roleActions).find(([,names])=>names.includes(name))?.[0];
 if(requiredTier && tierPower[tier]<tierPower[requiredTier])
  return reply(i,"Staff access denied. Requires the **"+requiredTier.replace("_"," ")+"** tier or higher. Ask the server owner to assign a tier using /staffrole.");
 if(name==="signup") return reply(i,"Create your account on the official Zuzify website (PrezzStore, Zuzify Socials, ZuzuOS or FastProxy), then use /login or /linkaccount to connect it. Never give your website password to a Discord command.");
 if(name==="login"||name==="linkaccount"){
  const service=i.options.getString("service",true);
  if(!isService(service))return reply(i,"Select a supported Zuzify service.");
  await i.deferReply({ephemeral:true});
  const url=await createChallenge(i.user.id,service);
  return i.editReply({content:"Verify your existing **"+serviceNames[service]+"** account using this private one-time link (expires in 10 minutes):\n"+url+"\n\nThe sign-in happens in your browser, directly with Supabase Auth. Do not share this URL."});
 }
 if(name==="accounts"){
  await i.deferReply({ephemeral:true});
  if(!linkingReady())return i.editReply("Account linking is not configured on this bot host.");
  const links=await linkedAccounts(i.user.id);
  return i.editReply({embeds:[embed("Your linked Zuzify accounts",links.map(a=>"• **"+serviceNames[a.service as keyof typeof serviceNames]+"** — linked <t:"+Math.floor(new Date(a.linked_at).getTime()/1000)+":R>").join("\n")||"No linked accounts yet. Use /linkaccount to verify one.")]});
 }
 if(name==="unlinkaccount"){
  const service=i.options.getString("service",true);
  if(!isService(service))return reply(i,"Unsupported service.");
  await i.deferReply({ephemeral:true});
  const removed=await unlinkAccount(i.user.id,service);
  if(removed)queueOwnerLog("ecosystem_link_removed",i.guildId||"dm",i.user.id);
  return i.editReply(removed?"Disconnected "+serviceNames[service]+".":"No "+serviceNames[service]+" account was linked.");
 }
 if(name==="accountstats"){
  const service=i.options.getString("service",true);
  if(!isService(service))return reply(i,"Unsupported service.");
  await i.deferReply({ephemeral:true});
  const stats=await accountStats(i.user.id,service);
  if(!stats)return i.editReply("This "+serviceNames[service]+" account is not linked. Use /linkaccount first.");
  const lines=stats.statsReady?Object.entries(stats.metrics).map(([k,v])=>"**"+k.replace(/([A-Z])/g," $1")+":** "+(v===null?"Unavailable":v)).join("\n"):"Website statistics require a separate read-only connection to the shared Zuzify database. Your account link is verified.";
  return i.editReply({embeds:[embed(serviceNames[service]+" — private account stats",(stats.displayName?"Account: "+stats.displayName+"\n":"")+(lines||"No statistics available yet."))]});
 }
 if(name==="mystats"){
  await i.deferReply({ephemeral:true});
  const links=linkingReady()?await linkedAccounts(i.user.id):[];
  const member=i.guildId?await memberData(i.guildId,i.user.id):null;
  return i.editReply({embeds:[embed("Your Zuzify overview","Discord: "+i.user.username+"\nLevel: "+(member?.level??"Not tracked")+"\nXP: "+(member?.xp??0)+"\nMessages: "+(member?.message_count??0)+"\nLinked sites: "+(links.map(a=>serviceNames[a.service as keyof typeof serviceNames]).join(", ")||"None"))]});
 }
 if(name==="version")return reply(i,"ZuzifyDiscordBot v"+config.version+" — OpenAI-ready AI, community points, secure ecosystem account linking, new stats, owner notifications, and expanded commands.");
 if(name==="changelog")return reply(i,"v"+config.version+": OpenAI-ready AI, server-selectable style, community points, 6 more slash commands, secure account linking, private account statistics, owner update DMs, notifications, and diagnostics.");
 if(name==="uptime")return reply(i,"Online for "+Math.floor((client.uptime||0)/60000)+" minutes. Gateway latency: "+client.ws.ping+"ms.");
 if(name==="privacy")return reply(i,"Zuzify account links are private to your Discord user. Website authentication runs directly with Supabase Auth in the browser; the bot stores only verified user IDs, not passwords or sessions. Use /unlinkaccount to disconnect. Personal website statistics are visible only to you.");
 if(name==="links")return reply(i,"Official Zuzify services:\nPrezzStore: https://prezz-store.vercel.app\nZuzify Socials: https://zuzifysocials.vercel.app\nZuzuOS: https://zuzuos.lol\nFor FastProxy, use the official URL shared by its owner.");
 if(name==="owneralerttest"){
  if(tier!=="owner"&&i.user.id!==config.ownerAlertId)return reply(i,"Only the bot owner can test private alerts.");
  await i.deferReply({ephemeral:true});
  await urgentOwnerAlert("Zuzify notification test","Requested by Discord "+i.user.id+" in "+(i.guildId||"DM")+".");
  return i.editReply("Notification test requested. Delivery depends on the owner's DM privacy settings and the Discord API.");
 }
 if(name==="ecosystem") return i.reply({embeds:[embed("Zuzify Ecosystem","Connected services: ZuzuOS (zuzuos.lol), Zuzify Socials, and the Zuzify Discord Bot. Announcements are backed by Supabase.")],ephemeral:true});
 if(name==="latestnews") {
  await i.deferReply({ephemeral:true});
  const announcements=await latestAnnouncements(5);
  return i.editReply({embeds:[embed("Ecosystem announcements",announcements.map(a=>`**${a.title}** — ${a.source}\\n${a.body.slice(0,300)}`).join("\\n\\n")||"No announcements yet.")]});
 }
 if(name==="ecosystemannounce") {
  if(!i.guildId) return reply(i,"Use this in a server.");
  await i.deferReply({ephemeral:true});
  const channel=i.options.getChannel("channel",true);
  const title=i.options.getString("title",true),body=i.options.getString("message",true);
  const result=await publishAnnouncement({guildId:i.guildId,title,body,source:"discord",createdBy:i.user.id,channelId:channel.id});
  await setSetting(i.guildId,"announcement_channel",channel.id);
  return i.editReply(`Announcement published to Discord and stored for the Zuzify websites. ID: ${result.id}`);
 }
 if(name==="help"){
  return i.reply({embeds:[embed("Zuzify Bot — Commands","**Accounts**\n/signup · /login · /linkaccount · /accounts · /accountstats · /unlinkaccount · /mystats\n\n**Community**\n/help · /ping · /ecosystem · /latestnews · /links · /ai · /aistatus · /aistyle · /ecosystemstatus · /profile · /rank · /leaderboard · /points · /pointsboard · /pointsguide · /serverstats · /userinfo · /avatar · /serverinfo · /roleinfo · /channelinfo\n\n**Info**\n/version · /changelog · /uptime · /botstats · /privacy\n\n**Forms & support**\n/formpanel · /ticketpanel · /ticketstatus · /report · /suggest · /application · /poll\n\n**Moderation & setup**\n/setup · /rankrole · /rankconfig · /configchannel · /warn · /warnings · /warningscount · /timeout · /untimeout · /kick · /ban · /purge · /lock · /unlock · /slowmode · /nickname · /roleadd · /roleremove · /announce · /ecosystemannounce · /suggestionreview · /recentlogs · /owneralerttest")],ephemeral:true});
 }
 if(name==="ping") return i.reply({embeds:[embed("Pong",`Gateway ping: ${client.ws.ping} ms\nRound-trip: ${Date.now()-i.createdTimestamp} ms`)],ephemeral:true});
 if(name==="about") return i.reply({embeds:[embed("Zuzify Discord Bot","A standalone community bot for the Zuzify app ecosystem. Includes persistent profiles, forms, rank rewards, moderation tools and optional Groq AI.")],ephemeral:true});
 if((name==="suggest"||name==="report"||name==="application")&&!guild) return reply(i,"Use this form inside your Discord server.");
 if(name==="suggest") return openModal(i,"form:suggest","Submit a suggestion",[{id:"title",label:"Suggestion title",max:100},{id:"details",label:"Explain your idea",style:TextInputStyle.Paragraph,max:1500}]);
 if(name==="report") return openModal(i,"form:report","Submit a private report",[{id:"subject",label:"Report subject",max:100},{id:"details",label:"What happened? Include relevant context",style:TextInputStyle.Paragraph,max:1500}]);
 if(name==="application") return openModal(i,"form:application","Zuzify community application",[{id:"role",label:"What are you applying for?",max:100},{id:"experience",label:"Relevant experience",style:TextInputStyle.Paragraph,max:1000},{id:"why",label:"Why should we consider you?",style:TextInputStyle.Paragraph,max:1000}]);
 if(name==="aistatus")return reply(i,"Zuzify AI provider: **"+aiProvider()+"**. Automatic messages: "+(config.aiChatEnabled?"enabled":"disabled")+". Model: "+(config.openaiApiKey?config.openaiModel:config.groqApiKey?config.groqModel:"none")+". API secrets are never displayed.");
 if(name==="aistyle"){
  if(!i.guildId)return reply(i,"Use this in a server.");
  const tone=i.options.getString("tone",true);
  if(!["friendly","professional","playful","study"].includes(tone))return reply(i,"Invalid style.");
  await setSetting(i.guildId,"ai_tone",tone);
  return reply(i,"Zuzify AI response style set to "+tone+". The bot will not mimic individual members or store private chat histories.");
 }
 if(name==="ecosystemstatus"){
  await i.deferReply({ephemeral:true});
  const links=linkingReady()?await linkedAccounts(i.user.id):[];
  return i.editReply("Zuzify integration overview\\n• Shared login verification: "+(linkingReady()?"configured":"unavailable")+"\\n• Linked services: "+(links.map(x=>x.service).join(", ")||"none")+"\\n• Announcements: supported\\n• Cross-site private statistics: "+(config.ecosystemServiceKey?"configured":"needs separate server key"));
 }
 if(name==="pointsguide")return reply(i,"You earn community points by participating in the server. **1 XP = 1 point.** Points follow existing rank cooldowns and anti-spam rules. Check /points, /pointsboard and /rank. No purchase is required.");
 if(name==="points"||name==="pointsboard"){
  if(!i.guildId)return reply(i,"Points are available in servers.");
  await i.deferReply({ephemeral:true});
  if(name==="points"){
   const user=i.options.getUser("user")||i.user;
   const member=await memberData(i.guildId,user.id);
   return i.editReply("**"+user.username+"** has **"+(member?.xp??0)+" points** (XP), level **"+(member?.level??0)+"**.");
  }
  const {data,error}=await db.from("bot_members").select("username,xp").eq("guild_id",i.guildId).order("xp",{ascending:false}).limit(10);
  if(error)throw new Error(error.message);
  return i.editReply({embeds:[embed("Zuzify points leaderboard",(data||[]).map((x,n)=>(n+1)+". "+x.username+": **"+(x.xp??0)+" points**").join("\\n")||"No members have earned points yet.")]});
 }
 if(name==="ai"){
  await i.deferReply({ephemeral:true});
  const style=i.guildId?await getSetting(i.guildId,"ai_tone")||"friendly":"friendly";
  const answer=await askGroq(i.options.getString("prompt",true),style);
  return i.editReply({embeds:[embed("Zuzify AI",answer.slice(0,4000))]});
 }
 if(!guild) return reply(i,"This command must be used in a server.");
 if(name==="botstats"){
  await i.deferReply({ephemeral:true});
  const [{count:members},{count:events},{count:tickets}]=await Promise.all([
   db.from("bot_members").select("id",{head:true,count:"exact"}).eq("guild_id",guild.id),
   db.from("bot_events").select("id",{head:true,count:"exact"}).eq("guild_id",guild.id),
   db.from("bot_tickets").select("id",{head:true,count:"exact"}).eq("guild_id",guild.id).eq("status","open")
  ]);
  return i.editReply({embeds:[embed("Zuzify bot statistics","Version: "+config.version+"\nUptime: "+Math.floor((client.uptime||0)/60000)+" minutes\nGateway latency: "+client.ws.ping+"ms\nTracked members: "+(members??0)+"\nLogged events: "+(events??0)+"\nOpen tickets: "+(tickets??0))]});
 }
 if(name==="userinfo"){
  const user=i.options.getUser("user")||i.user;
  return i.reply({embeds:[embed("Discord member — "+user.username,"User ID: "+user.id+"\nAccount created: <t:"+Math.floor(user.createdTimestamp/1000)+":D>\nBot account: "+(user.bot?"Yes":"No")).setThumbnail(user.displayAvatarURL())]});
 }
 if(name==="avatar"){
  const user=i.options.getUser("user")||i.user;
  return i.reply({embeds:[new EmbedBuilder().setTitle(user.username+"'s avatar").setImage(user.displayAvatarURL({size:1024})).setColor(colors.brand)],ephemeral:true});
 }
 if(name==="serverinfo")return i.reply({embeds:[embed(guild.name+" — server information","Server ID: "+guild.id+"\nCreated: <t:"+Math.floor(guild.createdTimestamp/1000)+":D>\nMembers: "+guild.memberCount+"\nChannels: "+guild.channels.cache.size+"\nRoles: "+guild.roles.cache.size)]});
 if(name==="roleinfo"){
  const role=i.options.getRole("role",true);
  return i.reply({embeds:[embed("Role information","Name: "+role.name+"\nID: "+role.id)]});
 }
 if(name==="channelinfo"){
  const channel=i.channel;
  return reply(i,channel?"Channel ID: "+channel.id+"\nType: "+channel.type:"Use this command inside a channel.");
 }
 if(name==="ticketstatus"){
  const {data,error}=await db.from("bot_tickets").select("channel_id,created_at").eq("guild_id",guild.id).eq("discord_user_id",i.user.id).eq("status","open").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(error)throw new Error(error.message);
  return reply(i,data?"Your ticket is open: "+(data.channel_id?"<#"+data.channel_id+">":"channel pending"):"You do not have an open ticket.");
 }
 if(name==="warningscount"){
  const {count,error}=await db.from("bot_warnings").select("id",{head:true,count:"exact"}).eq("guild_id",guild.id).eq("discord_user_id",i.user.id);
  if(error)throw new Error(error.message);
  return reply(i,"You have "+(count??0)+" recorded warnings in this server.");
 }
 if(name==="recentlogs"){
  if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return reply(i,"Manage Server permission required.");
  await i.deferReply({ephemeral:true});
  const {data,error}=await db.from("bot_events").select("event_type,created_at").eq("guild_id",guild.id).order("created_at",{ascending:false}).limit(10);
  if(error)throw new Error(error.message);
  return i.editReply({embeds:[embed("Recent server audit activity",(data||[]).map(row=>"• "+String(row.event_type).slice(0,70)+" — <t:"+Math.floor(new Date(row.created_at).getTime()/1000)+":R>").join("\n")||"No recent events.")]});
 }

 if(name==="serverstats"){
  const {count}=await db.from("bot_members").select("*",{count:"exact",head:true}).eq("guild_id",guild.id);
  return i.reply({embeds:[embed(`${guild.name} — Server stats`,`Members: ${guild.memberCount}\nChannels: ${guild.channels.cache.size}\nRoles: ${guild.roles.cache.size}\nBot-tracked profiles: ${count??0}\nCreated: <t:${Math.floor(guild.createdTimestamp/1000)}:D>`)]});
 }
 if(name==="profile"||name==="rank"){
  const user=i.options.getUser("user")||i.user; const data=await memberData(guild.id,user.id);
  if(!data) return reply(i,"No profile is stored yet. Try a command or send a message first.");
  const xp=Number(data.xp||0),level=Number(data.level||0),step=Number(await getSetting(guild.id,"level_step")||100);
  return i.reply({embeds:[embed(name==="rank"?`${user.username}'s rank`:`${user.username}'s Zuzify profile`,`Level: **${level}**\nXP: **${xp}**\nXP to next level: **${Math.max(0,(level+1)*step-xp)}**\nTracked messages: ${data.message_count??0}\nFirst seen: <t:${Math.floor(new Date(data.first_seen_at).getTime()/1000)}:D>\nLast seen: <t:${Math.floor(new Date(data.last_seen_at).getTime()/1000)}:R>`).setThumbnail(user.displayAvatarURL())]});
 }
 if(name==="leaderboard"){
  const {data,error}=await db.from("bot_members").select("discord_user_id,xp,level,username").eq("guild_id",guild.id).order("xp",{ascending:false}).limit(10);
  if(error) throw new Error(error.message);
  const lines=await Promise.all((data||[]).map(async (r,idx)=>{const u=await client.users.fetch(r.discord_user_id).catch(()=>null);return `${idx+1}. ${u?.username||r.username} — Level ${r.level}, ${r.xp} XP`;}));
  return i.reply({embeds:[embed("Zuzify XP Leaderboard",lines.join("\n")||"No ranked members yet.") ]});
 }
 if(name==="setup"){
  if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return reply(i,"You need Manage Server.");
  await i.deferReply({ephemeral:true}); await setupRanks(guild);
  await setSetting(guild.id,"log_channel",i.channelId);
  await logEvent(guild.id,i.user.id,"setup_completed");
  return i.editReply("Setup complete. Default rank roles and XP settings are configured. Use /rankconfig to adjust them.");
 }
 if(name==="configchannel"){
  const purpose=i.options.getString("purpose",true),channel=i.options.getChannel("channel",true);
  const textChannel=channel as TextChannel;
  if(typeof textChannel.send!=="function") return reply(i,"Choose a text channel.");
  await setSetting(guild.id,purpose,textChannel.id);
  return reply(i,`Saved <#${channel.id}> as the ${purpose.replace("_channel","")} channel.`);
 }
 if(name==="rankrole"){
  const level=i.options.getInteger("level",true),role=i.options.getRole("role",true);
  if(role.managed||!guild.members.me||role.position>=guild.members.me.roles.highest.position) return reply(i,"That role is managed or above the bot's highest role.");
  await setSetting(guild.id,`rank_role_${level}`,role.id);
  const {error}=await db.from("bot_rank_roles").upsert({guild_id:guild.id,level,role_id:role.id},{onConflict:"guild_id,level"});
  if(error) throw new Error(error.message);
  return reply(i,`Configured ${role} as the reward for level ${level}.`);
 }
 if(name==="rankconfig"){
  const min=i.options.getInteger("xp_min"),max=i.options.getInteger("xp_max"),cool=i.options.getInteger("cooldown"),step=i.options.getInteger("level_step");
  if(min!==null) await setSetting(guild.id,"xp_min",String(min));
  if(max!==null) await setSetting(guild.id,"xp_max",String(max));
  if(cool!==null) await setSetting(guild.id,"xp_cooldown",String(cool));
  if(step!==null) await setSetting(guild.id,"level_step",String(step));
  const a=Number(await getSetting(guild.id,"xp_min")||8),b=Number(await getSetting(guild.id,"xp_max")||15);
  if(a>b) return reply(i,"xp_min cannot be greater than xp_max. Run /rankconfig with valid values.");
  return reply(i,`Rank settings saved. XP/message: ${a}–${b}; cooldown: ${await getSetting(guild.id,"xp_cooldown")||45}s; XP per level step: ${await getSetting(guild.id,"level_step")||100}.`);
 }
 if(name==="formpanel"){
  const row1=new ActionRowBuilder<ButtonBuilder>().addComponents(
   new ButtonBuilder().setCustomId("form:suggest").setLabel("Suggestion").setStyle(ButtonStyle.Primary),
   new ButtonBuilder().setCustomId("form:report").setLabel("Private report").setStyle(ButtonStyle.Secondary),
   new ButtonBuilder().setCustomId("form:application").setLabel("Application").setStyle(ButtonStyle.Success)
  );
  const row2=new ActionRowBuilder<ButtonBuilder>().addComponents(
   new ButtonBuilder().setCustomId("account:link").setLabel("Link Zuzify account").setStyle(ButtonStyle.Secondary)
  );
  return i.reply({embeds:[embed("Zuzify Forms","Choose a button below. Forms are submitted privately to the bot.")],components:[row1,row2]});
 }
 if(name==="ticketpanel"){
  return i.reply({embeds:[embed("Zuzify Support","Press Open a ticket to create a private support channel.")],components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("ticket:open").setLabel("Open a ticket").setStyle(ButtonStyle.Primary))]});
 }
 if(name==="poll"){
  const question=i.options.getString("question",true);
  const options=[1,2,3,4,5].map(n=>i.options.getString(`option${n}`)).filter((v):v is string=>Boolean(v));
  const e=embed(`Poll: ${question}`,options.map((o,idx)=>`${["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"][idx]} ${o}`).join("\n")).setFooter({text:`Poll by ${i.user.username}`});
  const sent=await i.reply({embeds:[e],fetchReply:true});
  for(let idx=0;idx<options.length;idx++) await sent.react(["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"][idx]).catch(()=>null);
  await db.from("bot_polls").insert({guild_id:guild.id,discord_user_id:i.user.id,question,options,message_id:sent.id});
  return;
 }
 const staffTiers=["moderator","community_manager","admin","owner"] as const;
 if(name==="staffperms")return reply(i,"Your staff tier: **"+tier+"**. Tiers are separate and ordered: Moderator (warnings/timeouts), Community Manager (applications/announcements), Admin (kicks/bans/configuration), Owner (staff role assignments). Discord's own channel and role permissions still apply.");
 if(name==="staffrole"){
  const target=i.options.getString("tier",true),role=i.options.getRole("role",true);
  if(!staffTiers.includes(target as typeof staffTiers[number]))return reply(i,"Unknown tier.");
  await setSetting(guild.id,"staff_role_"+target,role.id);
  return reply(i,"Assigned **"+role.name+"** to **"+target+"** tier.");
 }
 if(name==="applicationreview"){
  const id=i.options.getString("id",true),decision=i.options.getString("decision",true),note=i.options.getString("note")||"";
  const {data,error}=await db.from("bot_forms").select("id,discord_user_id,title").eq("guild_id",guild.id).eq("form_type","application").eq("id",id).maybeSingle();
  if(error)throw new Error(error.message);
  if(!data)return reply(i,"Application not found. Use its exact ID.");
  await setSetting(guild.id,"application_decision_"+id,JSON.stringify({decision,note,by:i.user.id}));
  const applicant=await client.users.fetch(data.discord_user_id).catch(()=>null);
  const delivered=Boolean(await applicant?.send("Your application to **"+guild.name+"** ("+data.title+") has been **"+decision+"**."+ (note?"\nNote: "+note:"")).then(()=>true).catch(()=>false));
  await logEvent(guild.id,i.user.id,"application_"+decision,{id,applicant:data.discord_user_id,delivered});
  return reply(i,"Application "+decision+". Applicant DM "+(delivered?"delivered.":"could not be delivered (privacy settings)."));
 }
 if(name==="gifsearch"){
  const key=process.env.GIPHY_API_KEY?.trim();
  if(!key)return reply(i,"GIF search requires a GIPHY_API_KEY set privately in Railway. Saved GIF inventory works without a key.");
  await i.deferReply({ephemeral:true});
  const q=i.options.getString("query",true);
  const url="https://api.giphy.com/v1/gifs/search?api_key="+encodeURIComponent(key)+"&q="+encodeURIComponent(q)+"&limit=5&rating=g";
  const response=await fetch(url,{signal:AbortSignal.timeout(9000)});
  if(!response.ok)return i.editReply("GIF provider temporarily unavailable.");
  const result=await response.json() as {data?:Array<{title?:string;images?:{original?:{url?:string}}}>};
  const results=(result.data||[]).map((x,n)=>(n+1)+". "+(x.title||"GIF")+": "+(x.images?.original?.url||"")).filter(x=>x.length<650);
  return i.editReply(results.join("\n")||"No GIFs found.");
 }
 if(["gifsave","gifs","gifuse","gifremove"].includes(name)){
  const settingKey="gif_inventory_"+i.user.id;
  const saved=await getSetting(guild.id,settingKey);
  let inventory:Record<string,string>={};
  try{inventory=JSON.parse(saved||"{}");}catch{}
  if(name==="gifs")return reply(i,"Your saved GIFs: "+(Object.keys(inventory).join(", ")||"none")+". Use /gifuse to post.");
  const n=i.options.getString("name",true).toLowerCase().trim();
  if(!/^[a-z0-9_-]{1,28}$/.test(n))return reply(i,"Use 1-28 letters, digits, underscores or hyphens for GIF names.");
  if(name==="gifsave"){
   const u=i.options.getString("url",true);
   let parsed:URL;try{parsed=new URL(u);}catch{return reply(i,"Invalid URL.");}
   if(parsed.protocol!=="https:"||!["media.giphy.com","i.giphy.com","media.tenor.com","c.tenor.com"].includes(parsed.hostname))return reply(i,"Use an HTTPS GIF from GIPHY or Tenor media domains.");
   if(!inventory[n]&&Object.keys(inventory).length>=25)return reply(i,"Inventory limit is 25 GIFs.");
   inventory[n]=u;
   await setSetting(guild.id,settingKey,JSON.stringify(inventory));
   return reply(i,"Saved GIF **"+n+"**.");
  }
  if(!inventory[n])return reply(i,"No saved GIF with that name.");
  if(name==="gifremove"){delete inventory[n];await setSetting(guild.id,settingKey,JSON.stringify(inventory));return reply(i,"Removed GIF **"+n+"**.");}
  return i.reply({content:inventory[n],allowedMentions:{parse:[]}});
 }
 if(name==="suggestionreview"){
  const id=i.options.getString("id",true),decision=i.options.getString("decision",true),note=i.options.getString("note")||"";
  const {data,error}=await db.from("bot_suggestions").update({status:decision,reviewed_by:i.user.id,review_note:note}).eq("guild_id",guild.id).eq("id",id).select("id").maybeSingle();
  if(error) throw new Error(error.message);
  if(!data) return reply(i,"Suggestion not found. Use the full ID shown when it was submitted.");
  await logEvent(guild.id,i.user.id,"suggestion_reviewed",{id,decision,note});
  return reply(i,`Suggestion ${decision}. Reference: ${id}`);
 }
 if(name==="warn"){
  const user=i.options.getUser("user",true),reason=i.options.getString("reason",true);
  const {error}=await db.from("bot_warnings").insert({guild_id:guild.id,discord_user_id:user.id,moderator_id:i.user.id,reason});
  if(error) throw new Error(error.message);
  await logEvent(guild.id,i.user.id,"member_warned",{target:user.id,reason});
  await user.send(`Moderation notice — ${guild.name}\nAction: Warning\nReason: ${reason}`).catch(()=>null);
  return reply(i,`Warned ${user.tag}. Reason: ${reason}`);
 }
 if(name==="warnings"){
  const user=i.options.getUser("user",true);
  const {data,error}=await db.from("bot_warnings").select("reason,moderator_id,created_at").eq("guild_id",guild.id).eq("discord_user_id",user.id).order("created_at",{ascending:false}).limit(10);
  if(error) throw new Error(error.message);
  return i.reply({embeds:[embed(`Warnings for ${user.username}`,(data||[]).map((w,n)=>`${n+1}. ${w.reason} — <@!${w.moderator_id}> (<t:${Math.floor(new Date(w.created_at).getTime()/1000)}:R>)`).join("\n")||"No warnings found.")]});
 }
 if(name==="timeout"||name==="untimeout"||name==="kick"||name==="ban"){
  const user=i.options.getUser("user",true),member=await guild.members.fetch(user.id).catch(()=>null);
  if(!member) return reply(i,"That member is not in this server.");
  if(member.id===i.user.id||member.id===client.user?.id) return reply(i,"You cannot moderate yourself or the bot.");
  const reason=i.options.getString("reason")||`Action by ${i.user.tag}`;
  const actionLabel=name==="timeout"?"Timed out":name==="kick"?"Kicked":name==="ban"?"Banned":"Timeout removed";
  const duration=name==="timeout"?i.options.getInteger("minutes",true):null;
  if(name==="timeout") await member.timeout(i.options.getInteger("minutes",true)*60_000,reason);
  else if(name==="untimeout") await member.timeout(null,reason);
  else if(name==="kick") await member.kick(reason);
  else await guild.members.ban(user.id,{reason});
  await user.send(`Moderation notice — ${guild.name}\nAction: ${actionLabel}${duration?" ("+duration+" minutes)":""}\nReason: ${reason}`).catch(()=>null);
  await logEvent(guild.id,i.user.id,name,{target:user.id,reason});
  return reply(i,`${name} completed for ${user.tag}.`);
 }
 if(name==="purge"){
  const channel=i.channel;
  if(!channel||!channel.isTextBased()||!("bulkDelete" in channel)) return reply(i,"Use this in a text channel.");
  const count=await (channel as TextChannel).bulkDelete(i.options.getInteger("amount",true),true);
  return reply(i,`Deleted ${count.size} recent messages.`);
 }
 if(name==="lock"||name==="unlock"){
  const ch=i.channel;
  if(!ch||!ch.isTextBased()||!guild.members.me) return reply(i,"Use this in a text channel.");
  const overwrite=name==="lock"?{SendMessages:false}:{SendMessages:null};
  await (ch as TextChannel).permissionOverwrites.edit(guild.roles.everyone,overwrite);
  await logEvent(guild.id,i.user.id,name,{channel:ch.id});
  return reply(i,`Channel ${name}ed.`);
 }
 if(name==="slowmode"){
  const ch=i.channel;if(!ch||!ch.isTextBased()||!("setRateLimitPerUser" in ch)) return reply(i,"Use this in a text channel.");
  await (ch as TextChannel).setRateLimitPerUser(i.options.getInteger("seconds",true));
  return reply(i,"Slowmode updated.");
 }
 if(name==="nickname"){
  const user=i.options.getUser("user",true),member=await guild.members.fetch(user.id);
  await member.setNickname(i.options.getString("nickname",true));
  return reply(i,`Nickname updated for ${user.username}.`);
 }
 if(name==="roleadd"||name==="roleremove"){
  const user=i.options.getUser("user",true),role=i.options.getRole("role",true),member=await guild.members.fetch(user.id);
  if(role.managed||role.position>=guild.members.me!.roles.highest.position) return reply(i,"That role is managed or above the bot's highest role.");
  if(name==="roleadd") await member.roles.add(role.id); else await member.roles.remove(role.id);
  return reply(i,`${role.name} ${name==="roleadd"?"added to":"removed from"} ${user.username}.`);
 }
 if(name==="announce"){
  const ch=i.options.getChannel("channel",true),message=i.options.getString("message",true);
  const textChannel=ch as TextChannel;
  if(typeof textChannel.send!=="function") return reply(i,"Choose a text channel.");
  await textChannel.send({embeds:[embed("Zuzify Announcement",message)]});
  return reply(i,"Announcement sent.");
 }
 return reply(i,"That command is not implemented yet.");
}
async function handleModal(i:ModalSubmitInteraction){
 if(i.customId.startsWith("form:")){
  if(i.customId==="form:suggest"){
   const title=i.fields.getTextInputValue("title"),details=i.fields.getTextInputValue("details");
   const {data,error}=await db.from("bot_suggestions").insert({guild_id:i.guildId,discord_user_id:i.user.id,title,details}).select("id").single();
   if(error) throw new Error(error.message);
   const channelId=i.guildId?await getSetting(i.guildId,"suggestion_channel"):null;
   if(channelId&&i.guild){const ch=await i.guild.channels.fetch(channelId).catch(()=>null);if(ch?.isTextBased()&&"send" in ch) await (ch as TextChannel).send({embeds:[embed(`Suggestion: ${title}`,details).setFooter({text:`ID: ${data.id} • by ${i.user.tag}`})]});}
   await logEvent(i.guildId||"dm",i.user.id,"suggestion_submitted",{id:data.id});
   return reply(i,`Suggestion submitted. Reference ID: ${data.id}`);
  }
  if(i.customId==="form:report") return saveForm(i,"report",i.fields.getTextInputValue("subject"),{subject:i.fields.getTextInputValue("subject"),details:i.fields.getTextInputValue("details")});
  if(i.customId==="form:application") return saveForm(i,"application",i.fields.getTextInputValue("role"),{role:i.fields.getTextInputValue("role"),experience:i.fields.getTextInputValue("experience"),why:i.fields.getTextInputValue("why")});
  if(i.customId==="form:ticket") return saveForm(i,"ticket",i.fields.getTextInputValue("subject"),{subject:i.fields.getTextInputValue("subject"),details:i.fields.getTextInputValue("details")});
 }
}
client.on(Events.InteractionCreate,async (raw:Interaction)=>{
 try{
  if(raw.isChatInputCommand()) await handleCommand(raw);
  else if(raw.isModalSubmit()) await handleModal(raw);
  else if(raw.isButton()){
   const i=raw;
   if(i.customId==="ticket:open") await createTicket(i);
   else if(i.customId==="ticket:close"){
    if(!i.guild||!i.channel||!i.channel.isTextBased()) return reply(i,"Cannot close this ticket here.");
    const ticket=await db.from("bot_tickets").select("discord_user_id").eq("guild_id",i.guild.id).eq("channel_id",i.channel.id).eq("status","open").maybeSingle();
    const staff=i.memberPermissions?.has(PermissionFlagsBits.ManageChannels)??false;
    if(!staff&&ticket.data?.discord_user_id!==i.user.id) return reply(i,"Only the ticket opener or staff can close this ticket.");
    await i.reply({content:"Ticket closed. This channel will be removed in 5 seconds.",ephemeral:true});
    await db.from("bot_tickets").update({status:"closed",closed_at:new Date().toISOString()}).eq("guild_id",i.guild.id).eq("channel_id",i.channel.id);
    const channelToDelete=i.channel;
    setTimeout(()=>{void channelToDelete.delete("Ticket closed").catch(()=>null);},5000);
   }else if(i.customId==="account:link") await reply(i,"Run /linkaccount, choose a Zuzify website, and privately verify your account in the browser.");
   else if(i.customId==="form:suggest") await openModal(i,i.customId,"Submit a suggestion",[{id:"title",label:"Suggestion title",max:100},{id:"details",label:"Explain your idea",style:TextInputStyle.Paragraph,max:1500}]);
   else if(i.customId==="form:report") await openModal(i,i.customId,"Submit a private report",[{id:"subject",label:"Report subject",max:100},{id:"details",label:"What happened?",style:TextInputStyle.Paragraph,max:1500}]);
   else if(i.customId==="form:application") await openModal(i,i.customId,"Community application",[{id:"role",label:"Applying for",max:100},{id:"experience",label:"Relevant experience",style:TextInputStyle.Paragraph,max:1000},{id:"why",label:"Why should we consider you?",style:TextInputStyle.Paragraph,max:1000}]);
  }
 }catch(error){
  console.error("Interaction error:",error);
  queueOwnerLog("interaction_error:"+String(error instanceof Error?error.message:"Unknown").slice(0,90),raw.guildId||"dm",raw.user?.id);
  if(raw.isRepliable()) await reply(raw as ChatInputCommandInteraction|ButtonInteraction|ModalSubmitInteraction,"Something went wrong. The error was logged; check bot logs and confirm the Supabase migration has run.").catch(()=>null);
 }
});
client.on(Events.MessageCreate,async message=>{
 if(message.guild&&!message.author.bot&&message.channelId===config.aiChatChannelId) lastHumanMessageAt.set(message.channelId,Date.now());
 if(!message.guild||message.author.bot) return;
 try{
  await touchMember(message.guild.id,{id:message.author.id,username:message.author.username,globalName:message.author.globalName,avatarURL:()=>message.author.displayAvatarURL()});
  const cooldownKey=`xp_last_${message.author.id}`;
  const now=Date.now(),last=Number(await getSetting(message.guild.id,cooldownKey)||0);
  const cooldown=Number(await getSetting(message.guild.id,"xp_cooldown")||45)*1000;
  if(now-last<cooldown) return;
  await setSetting(message.guild.id,cooldownKey,String(now));
  const min=Number(await getSetting(message.guild.id,"xp_min")||8),max=Number(await getSetting(message.guild.id,"xp_max")||15);
  const gained=Math.floor(Math.random()*(Math.max(min,max)-Math.min(min,max)+1))+Math.min(min,max);
  const current=await memberData(message.guild.id,message.author.id);
  const oldXp=Number(current?.xp||0),step=Number(await getSetting(message.guild.id,"level_step")||100);
  const newXp=oldXp+gained,newLevel=Math.floor(newXp/step);
  const {error}=await db.from("bot_members").upsert({guild_id:message.guild.id,discord_user_id:message.author.id,username:message.author.username,display_name:message.member?.displayName||message.author.username,xp:newXp,level:newLevel,message_count:Number(current?.message_count||0)+1,last_seen_at:new Date().toISOString()},{onConflict:"guild_id,discord_user_id"});
  if(error) console.error("XP update failed:",error.message);
  if(newLevel>Number(current?.level||0)){
   // Silent XP: award roles without sending messages on level gains.
   const roleId=await getSetting(message.guild.id,`rank_role_${newLevel}`);
   if(roleId&&message.member) await message.member.roles.add(roleId).catch(()=>null);
   // Intentionally keep XP/level updates silent; no channel messages or audit notifications.
  }
 }catch(error){console.error("Message XP error:",error);}
});
client.on(Events.GuildMemberAdd,async member=>{
 try{await touchMember(member.guild.id,{id:member.id,username:member.user.username,globalName:member.user.globalName,avatarURL:()=>member.user.displayAvatarURL()});await logEvent(member.guild.id,member.id,"member_joined");}catch(e){console.error(e);}
});
client.on(Events.GuildMemberRemove,async member=>{
 try{await db.from("bot_members").update({last_seen_at:new Date().toISOString()}).eq("guild_id",member.guild.id).eq("discord_user_id",member.id);await logEvent(member.guild.id,member.id,"member_left");}catch(e){console.error(e);}
});
client.once(Events.ClientReady,ready=>{
 console.log(`Logged in as ${ready.user.tag}`);
 void (async()=>{
  const key="last_announced_bot_version";
  try{
   const last=await getSetting("global",key);
   if(last!==config.version){
    await setSetting("global",key,config.version);
    await urgentOwnerAlert("ZuzifyDiscordBot deployed","Version "+config.version+" is now connected as "+ready.user.tag+".");
   }
  }catch(error){console.error("Bot release notification could not be recorded:",error);}
 })();
 ready.user.setPresence({activities:[{name:config.status,type:ActivityType.Playing}],status:"online"});
 if(config.aiChatEnabled&&config.aiChatChannelId){
  lastHumanMessageAt.set(config.aiChatChannelId,Date.now());
  const timer=setInterval(()=>{void autonomousChatTick().catch(error=>console.error("Autonomous AI tick failed:",error));},60_000);
  timer.unref?.();
  console.log(`Autonomous AI enabled for channel ${config.aiChatChannelId}; idle threshold ${config.aiChatIdleMinutes}m, repeat interval ${config.aiChatIntervalMinutes}m`);
 }
});
process.on("unhandledRejection",error=>{console.error("Unhandled rejection:",error);queueOwnerLog("unhandled_rejection");});
process.on("uncaughtException",error=>{console.error("Uncaught exception:",error);queueOwnerLog("uncaught_exception");});
startApi();
await client.login(config.token);
