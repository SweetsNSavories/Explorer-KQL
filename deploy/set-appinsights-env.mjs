// Set vip_AppInsightsAppId env var to JSON array with two AI apps (incl. armId).
import fetch from "node-fetch";
import fs from "fs";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";

const ORG = "https://orgd90897e4.crm.dynamics.com";
const TENANT = "1557f771-4c8e-4dbd-8b80-dd00a88e833e";
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const CACHE_FILE = ".token-cache.json";
const SCHEMA = "vip_AppInsightsAppId";

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

const newValue = [
    {
        name: "appInsight",
        appId: "58f452e9-fcc9-4b39-9f12-8613b088ce26",
        armId: "/subscriptions/0a537d41-5022-4045-b883-9f81a4472cc6/resourceGroups/pravth-resource-group/providers/microsoft.insights/components/appInsight"
    },
    {
        name: "DynamicsOfficeWebhook",
        appId: "d9d4f1e3-d87b-46d8-839b-ec1166a6e581",
        armId: "/subscriptions/0a537d41-5022-4045-b883-9f81a4472cc6/resourceGroups/pravth-resource-group/providers/microsoft.insights/components/dynamicsofficewebhook"
    }
];
const newJson = JSON.stringify(newValue);

async function api(method, p, body) {
    const r = await fetch(ORG + '/api/data/v9.2/' + p, {
        method,
        headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion':'4.0','OData-Version':'4.0' },
        body: body ? JSON.stringify(body) : undefined
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${t}`);
    return t ? JSON.parse(t) : null;
}

const def = await api('GET', `environmentvariabledefinitions?$filter=schemaname eq '${SCHEMA}'&$select=environmentvariabledefinitionid`);
if (!def.value.length) throw new Error('definition not found: ' + SCHEMA);
const defId = def.value[0].environmentvariabledefinitionid;
console.log('defId:', defId);

const vals = await api('GET', `environmentvariablevalues?$filter=_environmentvariabledefinitionid_value eq ${defId}&$select=environmentvariablevalueid,value`);
const valRow = vals.value[0];
console.log('Old value:', valRow ? valRow.value : '(none)');
console.log('New value:', newJson);

if (valRow) {
    const r = await fetch(ORG + `/api/data/v9.2/environmentvariablevalues(${valRow.environmentvariablevalueid})`, {
        method:'PATCH',
        headers:{ Authorization:'Bearer '+tok, 'Content-Type':'application/json' },
        body: JSON.stringify({ value: newJson })
    });
    if (!r.ok) throw new Error('patch failed: ' + r.status + ' ' + await r.text());
    console.log('Patched value row OK.');
} else {
    await api('POST', 'environmentvariablevalues', {
        value: newJson,
        "EnvironmentVariableDefinitionId@odata.bind": `/environmentvariabledefinitions(${defId})`
    });
    console.log('Created value row OK.');
}
