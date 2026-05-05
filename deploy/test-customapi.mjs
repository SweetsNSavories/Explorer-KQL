// Quick end-to-end test of vip_conversationdiagnostics.
import fetch from "node-fetch";
import fs from "fs";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";

const ORG = "https://orgd90897e4.crm.dynamics.com";
const TENANT = "1557f771-4c8e-4dbd-8b80-dd00a88e833e";
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const CACHE_FILE = ".token-cache.json";

async function getToken() {
    const cachePlugin = {
        beforeCacheAccess: async (ctx) => { if (fs.existsSync(CACHE_FILE)) ctx.tokenCache.deserialize(fs.readFileSync(CACHE_FILE,'utf8')); },
        afterCacheAccess: async (ctx) => { if (ctx.cacheHasChanged) fs.writeFileSync(CACHE_FILE, ctx.tokenCache.serialize()); },
    };
    const pca = new PublicClientApplication({
        auth: { clientId: CLIENT_ID, authority: `https://login.microsoftonline.com/${TENANT}` },
        cache: { cachePlugin },
        system: { loggerOptions: { logLevel: LogLevel.Error } },
    });
    const scopes = [`${ORG}/.default`];
    const accounts = await pca.getTokenCache().getAllAccounts();
    if (accounts.length) { try { return (await pca.acquireTokenSilent({ account: accounts[0], scopes })).accessToken; } catch {} }
    const r = await pca.acquireTokenByDeviceCode({ scopes, deviceCodeCallback: (r) => console.log("\n>>> " + r.message + "\n") });
    return r.accessToken;
}
const tok = await getToken();

const body = {
    vip_KustoQuery: "union * | summarize n=count() by $table | top 20 by n",
    vip_QueryName: "",
    vip__startTime: "ago(7d)",
    vip__endTime: "now()",
};
const res = await fetch(`${ORG}/api/data/v9.2/vip_conversationdiagnostics`, {
    method: "POST",
    headers: { Authorization: 'Bearer ' + tok, 'OData-Version': '4.0', 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
});
console.log("Status:", res.status);
const txt = await res.text();
console.log("Body:", txt.length > 2000 ? txt.substring(0,2000) + "..." : txt);
