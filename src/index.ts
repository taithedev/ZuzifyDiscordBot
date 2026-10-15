import {
 Client, GatewayIntentBits, Events, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
 ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, type Interaction,
 type ChatInputCommandInteraction, type ModalSubmitInteraction, type ButtonInteraction, type GuildMember, type TextChannel
} from "discord.js";
import {randomBytes,scrypt as scryptCallback,timingSafeEqual} from "node:crypto";
import {promisify} from "node:util";
import {config} from "./config.js";
import {db,logEvent,touchMember,getSetting,setSetting} from "./db.js";
import {askGroq} from "./ai.js";
import {commands} from "./commands.js";
import {startApi} from "./api.js";
const scrypt=promisify(scryptCallback);
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
 const {error}=await db.from("bot_forms").insert({guild_id:i.guildId,discord_user_id:i.user.id,form_type:type,title,answers});
 if(error) throw new Error(error.message);
 await logEvent(i.guildId,i.user.id,"form_submitted",{type,title});
 const target=await getSetting(i.guildId,type+"_channel");
 if(target&&i.guild){
  const ch=await i.guild.channels.fetch(target).catch(()=>null);
  if(ch?.isTextBased()&&"send" in ch){
   const e=embed(title,Object.entries(answers).map(([k,v])=>`**${k}:** ${v}`).join("\n").slice(0,4000)).addFields({name:"Submitted by",value:`${i.user.tag} (${i.user.id})`});
   await (ch as TextChannel).send({embeds:[e]}).catch(()=>null);
  }
 }
 await reply(i,`Your ${type} form was submitted privately. Reference: ${title}`);
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
 if(!config.aiChatEnabled||!config.groqApiKey||!config.aiChatChannelId) return;
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
 const prompt="Write one short, natural Discord message to start a conversation in the Zuzify community while the chat is quiet. Make it feel like a real community member, not a system announcement. Vary the topic between technology, games, creative projects, app ideas, and light everyday conversation. Use at most 2 sentences, preferably one open-ended question. Do not mention inactivity, schedules, or that you are an AI. Do not use @everyone/@here, mass mentions, or markdown headings. Return only the message.";
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
 if(name==="help"){
  return i.reply({embeds:[embed("Zuzify Bot — Commands","**General**\n/help · /ping · /about · /serverstats · /profile · /rank · /leaderboard · /ai\n\n**Accounts and forms**\n/signup · /login · /formpanel · /application · /suggest · /report\n\n**Community**\n/poll · /ticketpanel · /suggestionreview\n\n**Ranks**\n/setup · /rankconfig\n\n**Moderation**\n/warn · /warnings · /timeout · /untimeout · /kick · /ban · /purge · /lock · /unlock · /slowmode · /nickname · /roleadd · /roleremove · /announce")],ephemeral:true});
 }
 if(name==="ping") return i.reply({embeds:[embed("Pong",`Gateway ping: ${client.ws.ping} ms\nRound-trip: ${Date.now()-i.createdTimestamp} ms`)],ephemeral:true});
 if(name==="about") return i.reply({embeds:[embed("Zuzify Discord Bot","A standalone community bot for the Zuzify app ecosystem. Includes persistent profiles, forms, rank rewards, moderation tools and optional Groq AI.")],ephemeral:true});
 if((name==="suggest"||name==="report"||name==="application")&&!guild) return reply(i,"Use this form inside your Discord server.");
 if(name==="signup") return openModal(i,"account:signup","Create Zuzify account",[{id:"username",label:"Username",placeholder:"3–24 letters, numbers or underscores",max:24},{id:"password",label:"Unique passphrase; do not reuse passwords",style:TextInputStyle.Paragraph,max:120}]);
 if(name==="login") return openModal(i,"account:login","Sign in to Zuzify account",[{id:"username",label:"Account username",max:24},{id:"password",label:"Account passphrase",style:TextInputStyle.Paragraph,max:120}]);
 if(name==="suggest") return openModal(i,"form:suggest","Submit a suggestion",[{id:"title",label:"Suggestion title",max:100},{id:"details",label:"Explain your idea",style:TextInputStyle.Paragraph,max:1500}]);
 if(name==="report") return openModal(i,"form:report","Submit a private report",[{id:"subject",label:"Report subject",max:100},{id:"details",label:"What happened? Include relevant context",style:TextInputStyle.Paragraph,max:1500}]);
 if(name==="application") return openModal(i,"form:application","Zuzify community application",[{id:"role",label:"What are you applying for?",max:100},{id:"experience",label:"Relevant experience",style:TextInputStyle.Paragraph,max:1000},{id:"why",label:"Why should we consider you?",style:TextInputStyle.Paragraph,max:1000}]);
 if(name==="ai"){
  await i.deferReply({ephemeral:true});
  const answer=await askGroq(i.options.getString("prompt",true));
  return i.editReply({embeds:[embed("Zuzify AI",answer.slice(0,4000))]});
 }
 if(!guild) return reply(i,"This command must be used in a server.");
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
   new ButtonBuilder().setCustomId("account:signup").setLabel("Create account").setStyle(ButtonStyle.Secondary),
   new ButtonBuilder().setCustomId("account:login").setLabel("Login").setStyle(ButtonStyle.Secondary)
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
  await user.send(`You were warned in ${guild.name}: ${reason}`).catch(()=>null);
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
  if(name==="timeout") await member.timeout(i.options.getInteger("minutes",true)*60_000,reason);
  else if(name==="untimeout") await member.timeout(null,reason);
  else if(name==="kick") await member.kick(reason);
  else await guild.members.ban(user.id,{reason});
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
 if(i.customId==="account:signup"||i.customId==="account:login"){
  const username=i.fields.getTextInputValue("username").trim().toLowerCase();
  const password=i.fields.getTextInputValue("password");
  if(!/^[a-z0-9_]{3,24}$/.test(username)) return reply(i,"Username must be 3–24 characters using letters, numbers or underscores.");
  if(password.length<10||password.length>120) return reply(i,"Use a unique passphrase between 10 and 120 characters. Do not reuse your Discord or email password.");
  if(i.customId==="account:signup"){
   const salt=randomBytes(16).toString("hex"),derived=await scrypt(password,salt,64) as Buffer;
   const {error}=await db.from("bot_accounts").insert({discord_user_id:i.user.id,username,password_hash:`${salt}:${derived.toString("hex")}`});
   if(error){if(error.code==="23505") return reply(i,"That username is already taken, or your Discord account already has a linked bot account.");throw new Error(error.message);}
   return reply(i,"Account created and linked to your Discord user. Never reuse a real account password.");
  }
  const {data,error}=await db.from("bot_accounts").select("id,password_hash").eq("discord_user_id",i.user.id).eq("username",username).maybeSingle();
  if(error) throw new Error(error.message);
  if(!data) return reply(i,"No matching account is linked to this Discord user. Use /signup first.");
  const [salt,hash]=String(data.password_hash).split(":");
  const actual=await scrypt(password,salt,64) as Buffer,expected=Buffer.from(hash,"hex");
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected)) return reply(i,"Invalid username or passphrase.");
  await db.from("bot_accounts").update({last_login_at:new Date().toISOString()}).eq("id",data.id);
  await logEvent(i.guildId||"dm",i.user.id,"account_login");
  return reply(i,"Signed in successfully. Your account is linked to this Discord user.");
 }
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
   }else if(i.customId.startsWith("account:")) await openModal(i,i.customId,i.customId.endsWith("signup")?"Create Zuzify account":"Sign in to Zuzify account",[{id:"username",label:"Username",max:24},{id:"password",label:"Unique passphrase",style:TextInputStyle.Paragraph,max:120}]);
   else if(i.customId==="form:suggest") await openModal(i,i.customId,"Submit a suggestion",[{id:"title",label:"Suggestion title",max:100},{id:"details",label:"Explain your idea",style:TextInputStyle.Paragraph,max:1500}]);
   else if(i.customId==="form:report") await openModal(i,i.customId,"Submit a private report",[{id:"subject",label:"Report subject",max:100},{id:"details",label:"What happened?",style:TextInputStyle.Paragraph,max:1500}]);
   else if(i.customId==="form:application") await openModal(i,i.customId,"Community application",[{id:"role",label:"Applying for",max:100},{id:"experience",label:"Relevant experience",style:TextInputStyle.Paragraph,max:1000},{id:"why",label:"Why should we consider you?",style:TextInputStyle.Paragraph,max:1000}]);
  }
 }catch(error){
  console.error("Interaction error:",error);
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
   if(message.channel.isTextBased()) await message.channel.send({embeds:[embed("Level up!",`<@${message.author.id}> reached level **${newLevel}**.`,colors.good)]}).catch(()=>null);
   const roleId=await getSetting(message.guild.id,`rank_role_${newLevel}`);
   if(roleId&&message.member) await message.member.roles.add(roleId).catch(()=>null);
   await logEvent(message.guild.id,message.author.id,"level_up",{level:newLevel,xp:newXp});
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
 ready.user.setPresence({activities:[{name:config.status,type:ActivityType.Playing}],status:"online"});
 if(config.aiChatEnabled&&config.aiChatChannelId){
  lastHumanMessageAt.set(config.aiChatChannelId,Date.now());
  const timer=setInterval(()=>{void autonomousChatTick().catch(error=>console.error("Autonomous AI tick failed:",error));},60_000);
  timer.unref?.();
  console.log(`Autonomous AI enabled for channel ${config.aiChatChannelId}; idle threshold ${config.aiChatIdleMinutes}m, repeat interval ${config.aiChatIntervalMinutes}m`);
 }
});
process.on("unhandledRejection",error=>console.error("Unhandled rejection:",error));
process.on("uncaughtException",error=>{console.error("Uncaught exception:",error);});
startApi();
await client.login(config.token);
