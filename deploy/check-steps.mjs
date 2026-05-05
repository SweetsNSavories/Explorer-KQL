// Verify which step has SecureConfig bound and what's in it.
import fetch from "node-fetch";
import fs from "fs";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";
const TENANT="1557f771-4c8e-4dbd-8b80-dd00a88e833e", CLIENT_ID="51f81489-12ee-4a9e-aaae-a2591f45987d", ORG="https://orgd90897e4.crm.dynamics.com";
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'));},afterCacheAccess:async(c)=>{if(c.cacheHasChanged)fs.writeFileSync('.token-cache.json',c.tokenCache.serialize());}};
const pca=new PublicClientApplication({auth:{clientId:CLIENT_ID,authority:'https://login.microsoftonline.com/'+TENANT},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const r=await pca.acquireTokenSilent({account:acc,scopes:[ORG+'/.default']});
const H={Authorization:'Bearer '+r.accessToken,Accept:'application/json','Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0'};
async function api(m,p,b){const r=await fetch(ORG+'/api/data/v9.2/'+p,{method:m,headers:H,body:b?JSON.stringify(b):undefined});const t=await r.text();if(!r.ok) throw new Error(m+' '+p+' '+r.status+': '+t.slice(0,400));return t?JSON.parse(t):null;}

// Find all steps for the vip_conversationdiagnostics message
const steps = await api('GET',
  "sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,stage,mode,_plugintypeid_value,_sdkmessageprocessingstepsecureconfigid_value,statecode" +
  "&$expand=plugintypeid($select=typename)" +
  "&$filter=plugintypeid/typename eq 'vip.ConversationDiagnosticsPreOp.ConversationDiagnosticsPreOpPlugin' or plugintypeid/typename eq 'PowerPlatform.Tools.AI.Connectors.LogsQueryClient.ConversationDiagnosticPlugin'");
for (const s of steps.value) {
  console.log({
    name: s.name, stage: s.stage, mode: s.mode, state: s.statecode,
    type: s.plugintypeid?.typename, hasSecure: !!s._sdkmessageprocessingstepsecureconfigid_value,
    secureId: s._sdkmessageprocessingstepsecureconfigid_value, stepId: s.sdkmessageprocessingstepid,
  });
  if (s._sdkmessageprocessingstepsecureconfigid_value) {
    const scc = await api('GET',`sdkmessageprocessingstepsecureconfigs(${s._sdkmessageprocessingstepsecureconfigid_value})?$select=secureconfig`);
    const v = scc.secureconfig || '';
    console.log('  secureconfig length:', v.length, 'sample:', v.slice(0, 100));
  }
}
