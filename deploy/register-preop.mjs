// Register the new plugin assembly + plugin type + stage 20 step
// on vip_conversationdiagnostics Custom API.
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";

const ORG = "https://orgd90897e4.crm.dynamics.com";
const TENANT = "1557f771-4c8e-4dbd-8b80-dd00a88e833e";
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const CACHE_FILE = ".token-cache.json";

const SDK_MESSAGE_ID = "cd1ce45b-4b48-4c01-84f4-f07268c30bcb"; // vip_conversationdiagnostics
const CUSTOMAPI_ID   = "153cad4e-6585-f011-b4cb-7c1e5217c8fa";

const DLL_PATH = path.resolve("..", "PreOpPlugin", "bin", "Release", "net462", "vip.ConversationDiagnosticsPreOp.dll");
const ASSEMBLY_NAME = "vip.ConversationDiagnosticsPreOp";
const TYPE_NAME = "vip.ConversationDiagnosticsPreOp.ConversationDiagnosticsPreOpPlugin";

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

async function api(method, route, body) {
    const res = await fetch(`${ORG}/api/data/v9.2/${route}`, {
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
    if (!res.ok) throw new Error(`${method} ${route} (${res.status}): ${text}`);
    return text ? JSON.parse(text) : null;
}

// --- Step 1: read DLL ---
const dllBytes = fs.readFileSync(DLL_PATH);
const dllB64 = dllBytes.toString("base64");
console.log(`DLL ${DLL_PATH} (${dllBytes.length} bytes)`);

// --- Step 2: find or create pluginassembly ---
const existing = await api("GET", `pluginassemblies?$select=pluginassemblyid,version,publickeytoken&$filter=name eq '${ASSEMBLY_NAME}'`);
let assemblyId;
if (existing.value.length) {
    assemblyId = existing.value[0].pluginassemblyid;
    console.log(`Updating existing assembly ${assemblyId}.`);
    await api("PATCH", `pluginassemblies(${assemblyId})`, { content: dllB64 });
} else {
    const created = await api("POST", "pluginassemblies", {
        name: ASSEMBLY_NAME,
        content: dllB64,
        sourcetype: 0,         // Database
        isolationmode: 2,      // Sandbox
        // version, culture, publickeytoken extracted automatically server-side
    });
    assemblyId = created.pluginassemblyid;
    console.log(`Created assembly ${assemblyId}.`);
}

// --- Step 3: find or create plugintype ---
const ptRows = await api("GET", `plugintypes?$select=plugintypeid&$filter=typename eq '${TYPE_NAME}' and _pluginassemblyid_value eq ${assemblyId}`);
let pluginTypeId;
if (ptRows.value.length) {
    pluginTypeId = ptRows.value[0].plugintypeid;
    console.log(`Plugin type exists: ${pluginTypeId}`);
} else {
    const created = await api("POST", "plugintypes", {
        typename: TYPE_NAME,
        friendlyname: TYPE_NAME,
        name: TYPE_NAME,
        "pluginassemblyid@odata.bind": `/pluginassemblies(${assemblyId})`,
    });
    pluginTypeId = created.plugintypeid;
    console.log(`Created plugin type ${pluginTypeId}.`);
}

// --- Step 4: ensure customapi allows custom steps + publish ---
await api("PATCH", `customapis(${CUSTOMAPI_ID})`, { allowedcustomprocessingsteptype: 2 });
console.log("Set allowedcustomprocessingsteptype=2");

// Publish customizations to make sdkmessage's iscustomprocessingstepallowed reflect the change.
const pubRes = await fetch(`${ORG}/api/data/v9.2/PublishXml`, {
    method: "POST",
    headers: {
        Authorization: `Bearer ${tok}`,
        "OData-MaxVersion": "4.0", "OData-Version": "4.0",
        Accept: "application/json", "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ ParameterXml: `<importexportxml><customapis><customapi>vip_conversationdiagnostics</customapi></customapis></importexportxml>` }),
});
console.log("PublishXml:", pubRes.status, await pubRes.text());

// --- Step 5: find filter for the message + create step ---
const filt = await api("GET", `sdkmessagefilters?$select=sdkmessagefilterid&$filter=_sdkmessageid_value eq ${SDK_MESSAGE_ID}&$top=1`);
const filterBind = filt.value.length ? `/sdkmessagefilters(${filt.value[0].sdkmessagefilterid})` : null;

const STEP_NAME = "vip.ConversationDiagnostics PreOp";
const stepRows = await api("GET", `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=name eq '${STEP_NAME}'`);
if (stepRows.value.length) {
    console.log(`Step already exists: ${stepRows.value[0].sdkmessageprocessingstepid}`);
} else {
    const stepBody = {
        name: STEP_NAME,
        description: "App Insights query executor (PreOp). Sets DiagnosticsDataJson before main op.",
        mode: 0,            // Synchronous
        rank: 1,
        stage: 20,          // PreOperation
        supporteddeployment: 0,
        invocationsource: 0,
        statecode: 0,
        statuscode: 1,
        asyncautodelete: false,
        "eventhandler_plugintype@odata.bind": `/plugintypes(${pluginTypeId})`,
        "sdkmessageid@odata.bind": `/sdkmessages(${SDK_MESSAGE_ID})`,
    };
    if (filterBind) stepBody["sdkmessagefilterid@odata.bind"] = filterBind;
    const step = await api("POST", "sdkmessageprocessingsteps", stepBody);
    console.log(`Created step ${step.sdkmessageprocessingstepid}.`);
}

console.log("\nDone.");
