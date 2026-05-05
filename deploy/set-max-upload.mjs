import fs from 'fs';
import fetch from 'node-fetch';
import { PublicClientApplication, LogLevel } from '@azure/msal-node';
const TENANT='1557f771-4c8e-4dbd-8b80-dd00a88e833e', CLIENT_ID='51f81489-12ee-4a9e-aaae-a2591f45987d', ORG='https://orgd90897e4.crm.dynamics.com';
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'))},afterCacheAccess:async(c)=>{if(c.cacheHasChanged)fs.writeFileSync('.token-cache.json',c.tokenCache.serialize())}};
const pca=new PublicClientApplication({auth:{clientId:CLIENT_ID,authority:'https://login.microsoftonline.com/'+TENANT},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const tok=(await pca.acquireTokenSilent({account:acc,scopes:[ORG+'/.default']})).accessToken;
const H={Authorization:'Bearer '+tok,'Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0','Accept':'application/json'};

// Fetch organization
const r=await fetch(`${ORG}/api/data/v9.2/organizations?$select=organizationid,name,maxuploadfilesize`,{headers:H});
const j=await r.json();
console.log('current:', JSON.stringify(j.value,null,2));
const orgId=j.value[0].organizationid;

// Set max upload to 128 MB (max allowed = 131072000 bytes per docs; v9 allows up to 131,072,000)
const NEW_MAX = 131072000; // ~125 MB, the documented hard cap
const u=await fetch(`${ORG}/api/data/v9.2/organizations(${orgId})`,{method:'PATCH',headers:H,body:JSON.stringify({maxuploadfilesize:NEW_MAX})});
console.log('patch:', u.status, await u.text());

const r2=await fetch(`${ORG}/api/data/v9.2/organizations(${orgId})?$select=maxuploadfilesize`,{headers:H});
console.log('after:', await r2.text());
