import fetch from "node-fetch";
import fs from "fs";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";
const TENANT="1557f771-4c8e-4dbd-8b80-dd00a88e833e", CLIENT_ID="51f81489-12ee-4a9e-aaae-a2591f45987d", ORG="https://orgd90897e4.crm.dynamics.com";
const cachePlugin = { beforeCacheAccess: async(ctx)=>{ if(fs.existsSync('.token-cache.json')) ctx.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8')); }, afterCacheAccess: async(ctx)=>{ if(ctx.cacheHasChanged) fs.writeFileSync('.token-cache.json', ctx.tokenCache.serialize()); } };
const pca = new PublicClientApplication({ auth:{ clientId:CLIENT_ID, authority:`https://login.microsoftonline.com/${TENANT}`}, cache:{cachePlugin}, system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc = (await pca.getTokenCache().getAllAccounts())[0];
const r = await pca.acquireTokenSilent({account:acc, scopes:[`${ORG}/.default`]});
const tok = r.accessToken;
const H = {Authorization:'Bearer '+tok,'Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0','Accept':'application/json'};
// Get current org settings
const o = await fetch(`${ORG}/api/data/v9.2/organizations?$select=organizationid,name,maxuploadfilesize`,{headers:H}).then(r=>r.json());
console.log('orgs:', JSON.stringify(o.value.map(v=>({id:v.organizationid,name:v.name,max:v.maxuploadfilesize}))));
const oid = o.value[0].organizationid;
// 16 MB = 16777216
const patch = await fetch(`${ORG}/api/data/v9.2/organizations(${oid})`,{method:'PATCH',headers:H,body:JSON.stringify({maxuploadfilesize:16777216})});
console.log('patch:', patch.status, await patch.text());
