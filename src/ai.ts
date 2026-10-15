import {config} from "./config.js";
export async function askGroq(prompt:string):Promise<string>{
 if(!config.groqApiKey) return "AI is not configured yet. Add GROQ_API_KEY to your host environment and restart the bot.";
 const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${config.groqApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:config.groqModel,messages:[{role:"system",content:"You are Zuzify Assistant, a helpful assistant for the Zuzify app ecosystem and its Discord community. Be clear, safe, and concise. Never claim to perform actions you did not perform."},{role:"user",content:prompt.slice(0,6000)}],temperature:0.6,max_tokens:900}),signal:AbortSignal.timeout(30000)});
 if(!response.ok){const details=await response.text().catch(()=>"");console.error("Groq request failed:",response.status,details.slice(0,500));if(response.status===401)return "Groq rejected the API key. Check GROQ_API_KEY in host settings.";if(response.status===429)return "Groq rate limit reached. Try again shortly.";return "The AI provider returned an error. Check the bot host logs.";}
 const json=await response.json() as {choices?:Array<{message?:{content?:string}}>};
 return json.choices?.[0]?.message?.content?.trim()||"The AI returned an empty response.";
}