import fs from "fs";
import fetch from "node-fetch";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";

const TENANT="1557f771-4c8e-4dbd-8b80-dd00a88e833e", CLIENT_ID="51f81489-12ee-4a9e-aaae-a2591f45987d";
const cache='.arm-token-cache.json';
const cachePlugin = { beforeCacheAccess: async(c)=>{ if(fs.existsSync(cache)) c.tokenCache.deserialize(fs.readFileSync(cache,'utf8')); }, afterCacheAccess: async(c)=>{ if(c.cacheHasChanged) fs.writeFileSync(cache, c.tokenCache.serialize()); } };
const pca = new PublicClientApplication({ auth:{clientId:CLIENT_ID, authority:`https://login.microsoftonline.com/${TENANT}`}, cache:{cachePlugin}, system:{loggerOptions:{logLevel:LogLevel.Error}} });
const acc = (await pca.getTokenCache().getAllAccounts())[0];
const tok = (await pca.acquireTokenSilent({ account: acc, scopes:['https://management.azure.com/.default'] })).accessToken;
const H = { Authorization:'Bearer '+tok };

const armId = "/subscriptions/0a537d41-5022-4045-b883-9f81a4472cc6/resourceGroups/pravth-resource-group/providers/microsoft.insights/components/appInsight";

async function dump(label, qs) {
    const url = `https://management.azure.com${armId}/analyticsItems?api-version=2015-05-01${qs?'&'+qs:''}`;
    const r = await fetch(url, { headers: H });
    const txt = await r.text();
    console.log('\n===', label, 'HTTP', r.status, '===');
    try {
        const j = JSON.parse(txt);
        const items = Array.isArray(j) ? j : (j.value || []);
        for (const it of items) console.log(' -', it.Name||it.name, '| Type=', it.Type||it.type, '| Scope=', it.Scope||it.scope);
    } catch { console.log(txt.slice(0,1000)); }
}

await dump('all (no filter)', '');
await dump('shared/query', 'scope=shared&type=query');
await dump('shared/function', 'scope=shared&type=function');
await dump('user/query', 'scope=user&type=query');
