import {REST,Routes} from "discord.js";
import {config} from "./config.js";
import {commands} from "./commands.js";
const rest=new REST({version:"10"}).setToken(config.token);
const body=commands.map(c=>c.data.toJSON());
if(config.guildId){await rest.put(Routes.applicationGuildCommands(config.clientId,config.guildId),{body});console.log(`Registered ${body.length} guild slash commands.`);}
else{await rest.put(Routes.applicationCommands(config.clientId),{body});console.log(`Registered ${body.length} global slash commands.`);}