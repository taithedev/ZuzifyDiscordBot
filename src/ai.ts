import {config} from "./config.js";

export async function askGroq(prompt:string):Promise<string>{
 if(!config.groqApiKey) return "AI is not configured yet. Add GROQ_API_KEY in your host Variables settings, then redeploy.";
 let response:Response;
 try {
  response=await fetch("https://api.groq.com/openai/v1/chat/completions",{
   method:"POST",
   headers:{"Authorization":`Bearer ${config.groqApiKey}`,"Content-Type":"application/json"},
   body:JSON.stringify({
    model:config.groqModel,
    messages:[
     {role:"system",content:"You are Zuzify Assistant, a helpful assistant for the Zuzify app ecosystem and its Discord community. Be clear, safe, and concise. Never claim to perform actions you did not perform."},
     {role:"user",content:prompt.slice(0,6000)}
    ],
    temperature:0.6,max_tokens:900
   }),
   signal:AbortSignal.timeout(30000)
  });
 } catch(error) {
  console.error("Groq network/timeout error:",error instanceof Error?error.message:error);
  return error instanceof Error && (error.name==="TimeoutError"||error.name==="AbortError")
   ?"The AI provider timed out. Please try again."
   :"Zuzify AI could not reach the provider. Check the host network and try again.";
 }
 if(!response.ok){
  const details=await response.text().catch(()=>"");
  console.error("Groq request failed:",response.status,details.slice(0,700));
  let providerMessage="";
  try {
   const parsed=JSON.parse(details) as {error?:{message?:string;code?:string}};
   providerMessage=parsed.error?.message||parsed.error?.code||"";
  } catch {}
  if(response.status===401||response.status===403) return "Groq rejected the API key or access. Check GROQ_API_KEY in host Variables.";
  if(response.status===429) return "Groq rate limit or quota reached. Check your Groq account limits and try again.";
  if(response.status===400||response.status===404){
   console.error("Check GROQ_MODEL value:",config.groqModel);
   return "The configured Groq model or request was rejected. Check GROQ_MODEL in host Variables and choose a currently available Groq model.";
  }
  if(response.status>=500) return "Groq is temporarily having a server problem. Try again shortly.";
  return `Groq returned HTTP ${response.status}${providerMessage?`: ${providerMessage.slice(0,180)}`:""}. Check host logs for details.`;
 }
 const json=await response.json() as {choices?:Array<{message?:{content?:string}}>};
 return json.choices?.[0]?.message?.content?.trim()||"The AI returned an empty response. Try a different prompt.";
}
