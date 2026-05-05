// Single-plugin / two-steps approach.
// Plugin: vip.ConversationDiagnosticsPreOp.ConversationDiagnosticsPreOpPlugin
// - Stage 20 (PreOperation) step (this script): primes token cache from SecureConfig.
// - Stage 30 step: existing custom-api-owned step (already bound to this type) does the work.
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const ORG = "https://orgd90897e4.crm.dynamics.com";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;

const SDK_MESSAGE_ID  = "cd1ce45b-4b48-4c01-84f4-f07268c30bcb"; // vip_conversationdiagnostics
const ASSEMBLY_NAME   = "vip.ConversationDiagnosticsPreOp";
const TYPE_NAME       = "vip.ConversationDiagnosticsPreOp.ConversationDiagnosticsPreOpPlugin";
const ORPHAN_TYPE     = "vip.ConversationDiagnosticsPreOp.TokenPrimerPlugin";
const STEP_NAME       = "vip.ConversationDiagnostics PreOp Token Primer (Stage 20)";

const DLL_PATH = path.resolve("..", "PreOpPlugin", "bin", "Release", "net462", "vip.ConversationDiagnosticsPreOp.dll");

const SECURE = JSON.stringify({
    tenantId:     "1557f771-4c8e-4dbd-8b80-dd00a88e833e",
    clientId:     "d84afeca-cc94-4e87-aec0-b1c70d799eb8",
    clientSecret: process.env.AAD_CLIENT_SECRET || (() => { throw new Error('Set AAD_CLIENT_SECRET env var'); })(),
});

async function api(method, route, body, extra) {
    const res = await fetch(`${ORG}/api/data/v9.2/${route}`, {
        method,
        headers: {
            Authorization: `Bearer ${tok}`,
            "OData-MaxVersion": "4.0", "OData-Version": "4.0",
            Accept: "application/json", "Content-Type": "application/json; charset=utf-8",
            Prefer: "return=representation",
            ...(extra || {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${route} (${res.status}): ${text}`);
    return text ? JSON.parse(text) : null;
}

// 1) Resolve assembly id
const asmRows = await api("GET", `pluginassemblies?$select=pluginassemblyid&$filter=name eq '${ASSEMBLY_NAME}'`);
const assemblyId = asmRows.value[0].pluginassemblyid;

// 2) Drop the orphan TokenPrimerPlugin plugintype FIRST (else uploading the DLL
// without that type will fail with "PluginType ... not found in PluginAssembly").
const orphan = await api("GET", `plugintypes?$select=plugintypeid&$filter=typename eq '${ORPHAN_TYPE}'`);
for (const p of orphan.value) {
    try { await api("DELETE", `plugintypes(${p.plugintypeid})`); console.log("Deleted orphan plugintype", p.plugintypeid); }
    catch (e) { console.log("Could not delete orphan", p.plugintypeid, e.message.slice(0,200)); }
}

// 3) Upload latest DLL
const dllB64 = fs.readFileSync(DLL_PATH).toString("base64");
await api("PATCH", `pluginassemblies(${assemblyId})`, { content: dllB64 });
console.log("Uploaded DLL to assembly", assemblyId);

// 3) Resolve plugintype id of the real plugin
const ptRows = await api("GET", `plugintypes?$select=plugintypeid&$filter=typename eq '${TYPE_NAME}' and _pluginassemblyid_value eq ${assemblyId}`);
if (!ptRows.value.length) throw new Error("Plugin type not found: " + TYPE_NAME);
const pluginTypeId = ptRows.value[0].plugintypeid;
console.log("Plugin type id:", pluginTypeId);

// 4) Find sdkmessagefilter for the message
const filt = await api("GET", `sdkmessagefilters?$select=sdkmessagefilterid&$filter=_sdkmessageid_value eq ${SDK_MESSAGE_ID}&$top=1`);
const filterBind = filt.value.length ? `/sdkmessagefilters(${filt.value[0].sdkmessagefilterid})` : null;

// 5) Create or reuse the Stage 20 step
const stepRows = await api("GET", `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,stage&$filter=name eq '${STEP_NAME}'`);
let stepId;
if (stepRows.value.length) {
    stepId = stepRows.value[0].sdkmessageprocessingstepid;
    console.log("Step exists:", stepId);
} else {
    // Try Stage 20 (PreOperation). If the customapi locks that out, fall back to 10 (PreValidation).
    const tryCreate = async (stage) => {
        const body = {
            name: STEP_NAME,
            description: "Primes AAD token from SecureConfig before the customapi step runs.",
            mode: 0, rank: 1, stage,
            supporteddeployment: 0, invocationsource: 0,
            statecode: 0, statuscode: 1, asyncautodelete: false,
            "eventhandler_plugintype@odata.bind": `/plugintypes(${pluginTypeId})`,
            "sdkmessageid@odata.bind": `/sdkmessages(${SDK_MESSAGE_ID})`,
        };
        if (filterBind) body["sdkmessagefilterid@odata.bind"] = filterBind;
        return api("POST", "sdkmessageprocessingsteps", body, { "MSCRM.SolutionUniqueName": "KustoExplorerSolution" });
    };
    let created;
    try { created = await tryCreate(20); console.log("Created Stage 20 step"); }
    catch (e) {
        console.log("Stage 20 rejected:", e.message.slice(0,200), "\nfalling back to Stage 10");
        created = await tryCreate(10);
        console.log("Created Stage 10 step");
    }
    stepId = created.sdkmessageprocessingstepid;
    console.log("Step id:", stepId);
}

// 6) Create / update SecureConfig and bind to the step
const stepFull = await api("GET", `sdkmessageprocessingsteps(${stepId})?$select=_sdkmessageprocessingstepsecureconfigid_value,stage`);
console.log("Step stage =", stepFull.stage);
let sccId = stepFull._sdkmessageprocessingstepsecureconfigid_value;
if (sccId) {
    await api("PATCH", `sdkmessageprocessingstepsecureconfigs(${sccId})`, { secureconfig: SECURE });
    console.log("Updated SecureConfig", sccId);
} else {
    const scc = await api("POST", "sdkmessageprocessingstepsecureconfigs", { secureconfig: SECURE });
    sccId = scc.sdkmessageprocessingstepsecureconfigid;
    await api("PATCH", `sdkmessageprocessingsteps(${stepId})`, {
        "sdkmessageprocessingstepsecureconfigid@odata.bind": `/sdkmessageprocessingstepsecureconfigs(${sccId})`,
    });
    console.log("Created and bound SecureConfig", sccId);
}

// 7) Add the new step to the solution (plugintype already added)
const r = await fetch(`${ORG}/api/data/v9.2/AddSolutionComponent`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ComponentId: stepId, ComponentType: 92, SolutionUniqueName: "KustoExplorerSolution", AddRequiredComponents: false }),
});
console.log("AddSolutionComponent step:", r.status, (await r.text()).slice(0,160));

console.log("\nDone.");
