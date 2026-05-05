// Fetch AppId GUIDs from ARM for the two AI components.
import fetch from "node-fetch";
import fs from "fs";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";
const TENANT="1557f771-4c8e-4dbd-8b80-dd00a88e833e", CLIENT_ID="51f81489-12ee-4a9e-aaae-a2591f45987d";
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.arm-token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.arm-token-cache.json','utf8'));},afterCacheAccess:async(c)=>{if(c.cacheHasChanged) fs.writeFileSync('.arm-token-cache.json', c.tokenCache.serialize());}};
const pca=new PublicClientApplication({auth:{clientId:CLIENT_ID,authority:`https://login.microsoftonline.com/${TENANT}`},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const scopes=['https://management.azure.com/.default'];
let token;
const accs=await pca.getTokenCache().getAllAccounts();
if (accs.length) {
  try { token=(await pca.acquireTokenSilent({account:accs[0],scopes})).accessToken; } catch {}
}
if (!token) {
  const r=await pca.acquireTokenByDeviceCode({scopes,deviceCodeCallback:(d)=>console.log('\n'+d.message+'\n')});
  token=r.accessToken;
}
const arms = [
  '/subscriptions/0a537d41-5022-4045-b883-9f81a4472cc6/resourceGroups/pravth-resource-group/providers/microsoft.insights/components/appInsight',
  '/subscriptions/0a537d41-5022-4045-b883-9f81a4472cc6/resourceGroups/pravth-resource-group/providers/Microsoft.Insights/components/DynamicsOfficeWebhook',
];
for (const a of arms) {
  const r = await fetch('https://management.azure.com'+a+'?api-version=2020-02-02', {headers:{Authorization:'Bearer '+token}});
  const j = await r.json();
  console.log(j.name, '-> AppId:', j.properties && j.properties.AppId, 'armId:', j.id);
}
