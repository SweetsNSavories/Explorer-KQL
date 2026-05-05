import fetch from "node-fetch";
import fs from "fs";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";

const ORG_URL  = "https://orgd90897e4.crm.dynamics.com";
const TENANT   = "1557f771-4c8e-4dbd-8b80-dd00a88e833e";
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const CACHE_FILE = ".token-cache.json";

const SECURE_CONFIG = [
    "appid=58f452e9-fcc9-4b39-9f12-8613b088ce26",
    "tenantid=1557f771-4c8e-4dbd-8b80-dd00a88e833e",
    "clientid=d84afeca-cc94-4e87-aec0-b1c70d799eb8",
    `clientsecret=${process.env.AAD_CLIENT_SECRET || (() => { throw new Error('Set AAD_CLIENT_SECRET env var'); })()}`,
].join(";");

async function getToken() {
    const cachePlugin = {
        beforeCacheAccess: async (ctx) => {
            if (fs.existsSync(CACHE_FILE)) ctx.tokenCache.deserialize(fs.readFileSync(CACHE_FILE, "utf8"));
        },
        afterCacheAccess: async (ctx) => {
            if (ctx.cacheHasChanged) fs.writeFileSync(CACHE_FILE, ctx.tokenCache.serialize());
        },
    };
    const pca = new PublicClientApplication({
        auth: { clientId: CLIENT_ID, authority: `https://login.microsoftonline.com/${TENANT}` },
        cache: { cachePlugin },
        system: { loggerOptions: { logLevel: LogLevel.Error } },
    });
    const scopes = [`${ORG_URL}/.default`];
    const accounts = await pca.getTokenCache().getAllAccounts();
    if (accounts.length) {
        try {
            const r = await pca.acquireTokenSilent({ account: accounts[0], scopes });
            return r.accessToken;
        } catch {}
    }
    const result = await pca.acquireTokenByDeviceCode({
        scopes, deviceCodeCallback: (r) => console.log("\n>>> " + r.message + "\n"),
    });
    return result.accessToken;
}

async function api(method, path, token, body) {
    const res = await fetch(`${ORG_URL}/api/data/v9.2/${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            Accept: "application/json",
            "Content-Type": "application/json; charset=utf-8",
            "Prefer": "return=representation",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} (${res.status}): ${text}`);
    return text ? JSON.parse(text) : null;
}

const token = await getToken();

// First find the plugin type id.
const types = await api("GET",
    "plugintypes?$select=plugintypeid,typename,name&$filter=typename eq 'LogsQueryClientPlugin.ConversationDiagnosticPlugin'",
    token);
console.log("Plugin types:", types.value);
if (!types.value.length) throw new Error("Plugin type not found");
const ptid = types.value[0].plugintypeid;

const steps = await api("GET",
    `sdkmessageprocessingsteps?$select=name,sdkmessageprocessingstepid,_sdkmessageprocessingstepsecureconfigid_value,configuration&$filter=_eventhandler_value eq ${ptid}`,
    token);
console.log("Steps:", steps.value.map(s => ({ name: s.name, sid: s.sdkmessageprocessingstepid, sec: s._sdkmessageprocessingstepsecureconfigid_value })));

if (!steps.value.length) {
    // Fallback: search by name.
    const alt = await api("GET",
        "sdkmessageprocessingsteps?$select=name,sdkmessageprocessingstepid,_sdkmessageprocessingstepsecureconfigid_value&$filter=contains(name,'ConversationDiagnostic')",
        token);
    console.log("Fallback:", alt.value);
    process.exit(1);
}

for (const step of steps.value) {
    let secId = step._sdkmessageprocessingstepsecureconfigid_value;
    if (!secId) {
        // Create new secure config row and link it.
        console.log(`Creating new secure config for step ${step.name}...`);
        const sec = await api("POST", "sdkmessageprocessingstepsecureconfigs", token, { secureconfig: SECURE_CONFIG });
        secId = sec.sdkmessageprocessingstepsecureconfigid;
        await api("PATCH", `sdkmessageprocessingsteps(${step.sdkmessageprocessingstepid})`, token, {
            "sdkmessageprocessingstepsecureconfigid@odata.bind": `/sdkmessageprocessingstepsecureconfigs(${secId})`,
        });
    } else {
        console.log(`Updating existing secure config ${secId}...`);
        await api("PATCH", `sdkmessageprocessingstepsecureconfigs(${secId})`, token, { secureconfig: SECURE_CONFIG });
    }
    console.log(`OK: ${step.name}`);
}

console.log("\nDone.");
