import fs from "fs";
import fetch from "node-fetch";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";

const TENANT="1557f771-4c8e-4dbd-8b80-dd00a88e833e", CLIENT_ID="51f81489-12ee-4a9e-aaae-a2591f45987d";
const cache='.arm-token-cache.json';
const cachePlugin = { beforeCacheAccess: async(c)=>{ if(fs.existsSync(cache)) c.tokenCache.deserialize(fs.readFileSync(cache,'utf8')); }, afterCacheAccess: async(c)=>{ if(c.cacheHasChanged) fs.writeFileSync(cache, c.tokenCache.serialize()); } };
const pca = new PublicClientApplication({ auth:{clientId:CLIENT_ID, authority:`https://login.microsoftonline.com/${TENANT}`}, cache:{cachePlugin}, system:{loggerOptions:{logLevel:LogLevel.Error}} });
const acc = (await pca.getTokenCache().getAllAccounts())[0];
const tok = (await pca.acquireTokenSilent({ account: acc, scopes:['https://management.azure.com/.default'] })).accessToken;

const armIds = [
    "/subscriptions/0a537d41-5022-4045-b883-9f81a4472cc6/resourceGroups/pravth-resource-group/providers/microsoft.insights/components/appInsight",
    "/subscriptions/0a537d41-5022-4045-b883-9f81a4472cc6/resourceGroups/pravth-resource-group/providers/microsoft.insights/components/dynamicsofficewebhook"
];

for (const armId of armIds) {
    const url = `https://management.azure.com${armId}/analyticsItems?api-version=2015-05-01&scope=shared&type=query&includeContent=true`;
    const r = await fetch(url, { headers: { Authorization:'Bearer '+tok } });
    const txt = await r.text();
    console.log('\n===', armId, 'HTTP', r.status, '===');
    if (!r.ok) { console.log(txt); continue; }
    try {
        const j = JSON.parse(txt);
        const items = Array.isArray(j) ? j : (j.value || []);
        console.log('items:', items.length);
        console.log(JSON.stringify(items, null, 2));
    } catch { console.log(txt); }
}
