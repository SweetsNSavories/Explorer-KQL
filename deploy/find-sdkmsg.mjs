import fetch from "node-fetch";
import fs from "fs";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'));},afterCacheAccess:async()=>{}};
const pca=new PublicClientApplication({auth:{clientId:'51f81489-12ee-4a9e-aaae-a2591f45987d',authority:'https://login.microsoftonline.com/1557f771-4c8e-4dbd-8b80-dd00a88e833e'},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const r=await pca.acquireTokenSilent({account:acc,scopes:['https://orgd90897e4.crm.dynamics.com/.default']});
const H={Authorization:'Bearer '+r.accessToken,Accept:'application/json'};
const ORG = 'https://orgd90897e4.crm.dynamics.com';
const m = await fetch(`${ORG}/api/data/v9.2/sdkmessages?$select=sdkmessageid,name&$filter=name eq 'vip_conversationdiagnostics'`,{headers:H}).then(r=>r.json());
console.log('sdkmessages by name=vip_conversationdiagnostics:', JSON.stringify(m.value,null,2));

// also get the existing stage 30 step to copy its sdkmessageid
const s = await fetch(`${ORG}/api/data/v9.2/sdkmessageprocessingsteps(6cddb1c8-7747-f111-bec7-7c1e521ab35c)?$select=name,_sdkmessageid_value`,{headers:H}).then(r=>r.json());
console.log('existing stage30 step sdkmessageid:', s._sdkmessageid_value);
