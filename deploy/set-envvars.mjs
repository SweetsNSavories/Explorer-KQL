// Creates 4 environment variables (definitions + values) for App Insights credentials.
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
    if (accounts.length) {
        try { return (await pca.acquireTokenSilent({ account: accounts[0], scopes })).accessToken; } catch {}
    }
    const r = await pca.acquireTokenByDeviceCode({ scopes, deviceCodeCallback: (r) => console.log("\n>>> " + r.message + "\n") });
    return r.accessToken;
}
const tok = await getToken();

const VARS = [
    { schema: "vip_AppInsightsAppId",        display: "App Insights App ID",        value: "58f452e9-fcc9-4b39-9f12-8613b088ce26" },
    { schema: "vip_AppInsightsTenantId",     display: "App Insights Tenant ID",     value: "1557f771-4c8e-4dbd-8b80-dd00a88e833e" },
    { schema: "vip_AppInsightsClientId",     display: "App Insights Client ID",     value: "d84afeca-cc94-4e87-aec0-b1c70d799eb8" },
    { schema: "vip_AppInsightsClientSecret", display: "App Insights Client Secret", value: process.env.AAD_CLIENT_SECRET || (() => { throw new Error('Set AAD_CLIENT_SECRET env var'); })() },
];

async function api(method, path, body) {
    const res = await fetch(`${ORG}/api/data/v9.2/${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${tok}`,
            "OData-MaxVersion": "4.0", "OData-Version": "4.0",
            Accept: "application/json", "Content-Type": "application/json; charset=utf-8",
            Prefer: "return=representation",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} (${res.status}): ${text}`);
    return text ? JSON.parse(text) : null;
}

for (const v of VARS) {
    // Find existing definition
    const existing = await api("GET",
        `environmentvariabledefinitions?$select=environmentvariabledefinitionid&$filter=schemaname eq '${v.schema}'`);
    let defId;
    if (existing.value.length) {
        defId = existing.value[0].environmentvariabledefinitionid;
        console.log(`Definition ${v.schema} exists: ${defId}`);
    } else {
        const def = await api("POST", "environmentvariabledefinitions", {
            schemaname: v.schema,
            displayname: v.display,
            description: "App Insights credential for Conversation Diagnostics plugin",
            type: 100000000, // String
        });
        defId = def.environmentvariabledefinitionid;
        console.log(`Created definition ${v.schema}: ${defId}`);
    }

    // Upsert value row
    const valRows = await api("GET",
        `environmentvariablevalues?$select=environmentvariablevalueid&$filter=_environmentvariabledefinitionid_value eq ${defId}`);
    if (valRows.value.length) {
        await api("PATCH", `environmentvariablevalues(${valRows.value[0].environmentvariablevalueid})`, { value: v.value });
        console.log(`  Updated value.`);
    } else {
        await api("POST", "environmentvariablevalues", {
            "EnvironmentVariableDefinitionId@odata.bind": `/environmentvariabledefinitions(${defId})`,
            value: v.value,
        });
        console.log(`  Created value.`);
    }
}
console.log("\nDone.");
