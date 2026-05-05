import fetch from "node-fetch";
import fs from "fs";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'));},afterCacheAccess:async()=>{}};
const pca=new PublicClientApplication({auth:{clientId:'51f81489-12ee-4a9e-aaae-a2591f45987d',authority:'https://login.microsoftonline.com/1557f771-4c8e-4dbd-8b80-dd00a88e833e'},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const r=await pca.acquireTokenSilent({account:acc,scopes:['https://orgd90897e4.crm.dynamics.com/.default']});
const H={Authorization:'Bearer '+r.accessToken,Accept:'application/json'};
const ORG='https://orgd90897e4.crm.dynamics.com';
const ids = {
  customapi: '508876c2-7747-f111-bec7-7c1e521ab35c',
  reqparam:  '75ddb1c8-7747-f111-bec7-7c1e521ab35c',
  respprop:  '9e6f94cd-7747-f111-bec6-7ced8d1dc79f',
};
for (const [k,v] of Object.entries(ids)) {
  const j = await fetch(`${ORG}/api/data/v9.2/solutioncomponents?$filter=objectid eq ${v}&$select=componenttype,objectid,_solutionid_value`, {headers:H}).then(r=>r.json());
  console.log(k, '->', JSON.stringify(j.value));
}
