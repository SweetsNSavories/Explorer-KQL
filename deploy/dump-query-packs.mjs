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
const SUB = "0a537d41-5022-4045-b883-9f81a4472cc6";

async function dump(label, url) {
    const r = await fetch(url, { headers: H });
    const txt = await r.text();
    console.log('\n===', label, 'HTTP', r.status, '===');
    try { console.log(JSON.stringify(JSON.parse(txt), null, 2).slice(0, 4000)); } catch { console.log(txt.slice(0,2000)); }
}

// 1. Subscription-wide query packs
await dump('subscription queryPacks',
    `https://management.azure.com/subscriptions/${SUB}/providers/Microsoft.OperationalInsights/queryPacks?api-version=2019-09-01`);
