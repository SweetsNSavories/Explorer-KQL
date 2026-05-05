// Upload the latest assembly DLL, register the TokenPrimerPlugin type,
// create a Stage 20 (PreValidation) step on vip_conversationdiagnostics
// with SecureConfig containing tenantId/clientId/clientSecret.
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const ORG = "https://orgd90897e4.crm.dynamics.com";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;

const SDK_MESSAGE_ID = "cd1ce45b-4b48-4c01-84f4-f07268c30bcb"; // vip_conversationdiagnostics
const ASSEMBLY_NAME  = "vip.ConversationDiagnosticsPreOp";
const PRIMER_TYPE    = "vip.ConversationDiagnosticsPreOp.TokenPrimerPlugin";
const PRIMER_STEP    = "vip.ConversationDiagnostics TokenPrimer (Stage 20)";

const DLL_PATH = path.resolve("..", "PreOpPlugin", "bin", "Release", "net462", "vip.ConversationDiagnosticsPreOp.dll");

// SecureConfig payload — Service Principal that can query the App Insights resource.
const SECURE = JSON.stringify({
    tenantId:     "1557f771-4c8e-4dbd-8b80-dd00a88e833e",
    clientId:     "d84afeca-cc94-4e87-aec0-b1c70d799eb8",
    clientSecret: process.env.AAD_CLIENT_SECRET || (() => { throw new Error('Set AAD_CLIENT_SECRET env var'); })(),
});

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

// 1) Upload latest DLL into the existing assembly row
const dllB64 = fs.readFileSync(DLL_PATH).toString("base64");
const asmRows = await api("GET", `pluginassemblies?$select=pluginassemblyid&$filter=name eq '${ASSEMBLY_NAME}'`);
if (!asmRows.value.length) throw new Error(`Assembly ${ASSEMBLY_NAME} not found.`);
const assemblyId = asmRows.value[0].pluginassemblyid;
await api("PATCH", `pluginassemblies(${assemblyId})`, { content: dllB64 });
console.log("Uploaded DLL to assembly", assemblyId);

// 2) Ensure TokenPrimerPlugin plugintype exists
const ptRows = await api("GET", `plugintypes?$select=plugintypeid&$filter=typename eq '${PRIMER_TYPE}' and _pluginassemblyid_value eq ${assemblyId}`);
let primerTypeId;
if (ptRows.value.length) {
    primerTypeId = ptRows.value[0].plugintypeid;
    console.log("Plugin type exists:", primerTypeId);
} else {
    const c = await api("POST", "plugintypes", {
        typename: PRIMER_TYPE,
        friendlyname: PRIMER_TYPE,
        name: PRIMER_TYPE,
        "pluginassemblyid@odata.bind": `/pluginassemblies(${assemblyId})`,
    });
    primerTypeId = c.plugintypeid;
    console.log("Created plugin type", primerTypeId);
}

// 3) Find sdkmessagefilter for the message
const filt = await api("GET", `sdkmessagefilters?$select=sdkmessagefilterid&$filter=_sdkmessageid_value eq ${SDK_MESSAGE_ID}&$top=1`);
const filterBind = filt.value.length ? `/sdkmessagefilters(${filt.value[0].sdkmessagefilterid})` : null;

// 4) Create or update Stage 20 step with SecureConfig
const stepRows = await api("GET", `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=name eq '${PRIMER_STEP}'`);
let stepId;
if (stepRows.value.length) {
    stepId = stepRows.value[0].sdkmessageprocessingstepid;
    console.log("Step exists:", stepId, "- patching plugintype binding.");
    await api("PATCH", `sdkmessageprocessingsteps(${stepId})`, {
        "eventhandler_plugintype@odata.bind": `/plugintypes(${primerTypeId})`,
        rank: 1,
        stage: 10,
        mode: 0,
        statecode: 0, statuscode: 1,
    });
} else {
    const stepBody = {
        name: PRIMER_STEP,
        description: "Stage 10 PreValidation token primer; reads SP creds from SecureConfig.",
        mode: 0, rank: 1, stage: 10, // 10=PreValidation, 20=PreOp, 40=PostOp
        supporteddeployment: 0, invocationsource: 0,
        statecode: 0, statuscode: 1, asyncautodelete: false,
        "eventhandler_plugintype@odata.bind": `/plugintypes(${primerTypeId})`,
        "sdkmessageid@odata.bind": `/sdkmessages(${SDK_MESSAGE_ID})`,
    };
    if (filterBind) stepBody["sdkmessagefilterid@odata.bind"] = filterBind;
    const created = await api("POST", "sdkmessageprocessingsteps", stepBody);
    stepId = created.sdkmessageprocessingstepid;
    console.log("Created step", stepId);
}

// 5) Set SecureConfig (separate sdkmessageprocessingstepsecureconfig record, then bind via step.sdkmessageprocessingstepsecureconfigid)
// Look up existing config for this step
const stepFull = await api("GET", `sdkmessageprocessingsteps(${stepId})?$select=_sdkmessageprocessingstepsecureconfigid_value`);
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

// 6) Add the TokenPrimer step + plugin type to the solution so they ship together
const SOL = "KustoExplorerSolution";
for (const c of [
    { id: primerTypeId, type: 90, name: "TokenPrimer plugintype" },
    { id: stepId,       type: 92, name: "TokenPrimer step" },
]) {
    const r = await fetch(`${ORG}/api/data/v9.2/AddSolutionComponent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ComponentId: c.id, ComponentType: c.type, SolutionUniqueName: SOL, AddRequiredComponents: false }),
    });
    console.log(r.status, c.name, (await r.text()).slice(0,180));
}

console.log("\nDone.");
