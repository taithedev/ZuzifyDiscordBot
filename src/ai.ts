import {config} from "./config.js";
export const aiProvider=()=>config.openaiApiKey?"OpenAI":config.groqApiKey?"Groq":"Not configured";
export async function askGroq(prompt:string,style="friendly, concise Discord community tone"):Promise<string>{
 const openai=Boolean(config.openaiApiKey);
 const key=openai?config.openaiApiKey:config.groqApiKey;
 if(!key)return "AI is not configured. Set a new OPENAI_API_KEY in Railway Variables, not in chat or GitHub.";
 const url=openai?"https://api.openai.com/v1/chat/completions":"https://api.groq.com/openai/v1/chat/completions";
 const model=openai?config.openaiModel:config.groqModel;
 try{
  const response=await fetch(url,{
   method:"POST",
   headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
   body:JSON.stringify({
    model,
    messages:[
     {role:"system",content:"You are Zuzify AI, an AI assistant for the Zuzify Discord community. Be helpful, kind, and accurate. Identify yourself as AI if asked. Use this general style guideline: "+style.slice(0,180)+". Never pretend to be a human server member, impersonate users, or invent access to private accounts. Do not imitate identifiable users' distinctive writing styles. Never reveal secrets."},
     {role:"user",content:prompt.slice(0,3000)}
    ],
    max_completion_tokens:550
   }),
   signal:AbortSignal.timeout(25000)
  });
  if(!response.ok){
   const raw=await response.text().catch(()=>"");
   console.error("AI provider request failed",aiProvider(),response.status,raw.slice(0,260).replace(/sk-[\w-]+/g,"[redacted]"));
   if(response.status===401||response.status===403)return "AI authentication failed. An admin needs to replace the provider key in Railway.";
   if(response.status===429)return "AI is currently rate limited or out of credits. Try later.";
   if(response.status===400||response.status===404)return "The configured AI model or request was rejected. Check OPENAI_MODEL or GROQ_MODEL.";
   return "AI temporarily unavailable (HTTP "+response.status+").";
  }
  const result=await response.json() as {choices?:Array<{message?:{content?:string|null}}>;error?:unknown};
  return result.choices?.[0]?.message?.content?.trim()?.slice(0,3800)||"AI returned no response. Try asking differently.";
 }catch(error){
  console.error("AI provider connection error",error instanceof Error?error.name:"unknown");
  return "AI connection timed out or could not reach the provider.";
 }
}
