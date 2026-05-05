// Hide the record header on the Kusto Explorer form by setting formjson.HeaderDensity = "None".
import fetch from "node-fetch";
import fs from "fs";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";

const ORG = "https://orgd90897e4.crm.dynamics.com";
const TENANT = "1557f771-4c8e-4dbd-8b80-dd00a88e833e";
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const CACHE_FILE = ".token-cache.json";
const FORM_ID = "69c22e59-1888-4d06-9afb-4d301a3a5d2f";

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

async function api(method, path, body) {
    const res = await fetch(`${ORG}/api/data/v9.2/${path}`, {
        method,
        headers: { Authorization: 'Bearer '+tok, 'OData-Version':'4.0', 'OData-MaxVersion':'4.0', Accept:'application/json', 'Content-Type':'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} (${res.status}): ${text}`);
    return text ? JSON.parse(text) : null;
}

const cur = await api("GET", `systemforms(${FORM_ID})?$select=name,formjson`);
console.log("Current formjson:", cur.formjson);

let json = {};
if (cur.formjson) {
    try { json = JSON.parse(cur.formjson); } catch { json = {}; }
}
// Modern forms: HeaderDensity=FlyoutHeader hides the record header (per Xrm.ui.setFormHeaderDensity API).
json.HeaderDensity = "FlyoutHeader";
json.ShowEntityImage = false;
if (json.Header) {
    json.Header.ShowBody = false;
}

const newJson = JSON.stringify(json);
console.log("New formjson:", newJson);

await api("PATCH", `systemforms(${FORM_ID})`, { formjson: newJson });
console.log("Patched.");

// Publish.
const r = await fetch(`${ORG}/api/data/v9.2/PublishXml`, {
    method: "POST",
    headers: { Authorization: 'Bearer '+tok, 'OData-Version':'4.0', 'Content-Type':'application/json' },
    body: JSON.stringify({ ParameterXml: `<importexportxml><systemforms><systemform>${FORM_ID}</systemform></systemforms></importexportxml>` }),
});
console.log("PublishXml:", r.status);
