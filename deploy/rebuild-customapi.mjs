// Recreate vip_conversationdiagnostics Custom API with
// AllowedCustomProcessingStepType = 2 (SyncAndAsync) so we can register
// a Stage 20 step with SecureConfig.
//
// Steps:
//   1. Snapshot current customapi + request parameters + response properties
//   2. Delete the existing Stage 30 step (else the row can't be deleted)
//   3. Delete request parameters and response properties
//   4. Delete the customapi row
//   5. Recreate customapi with AllowedCustomProcessingStepType=2 + same uniquename
//   6. Recreate request parameters / response property
//   7. Wait for the customapi-owned Stage 30 step to appear, then PATCH it to
//      bind eventhandler_plugintype back to ConversationDiagnosticsPreOpPlugin
//   8. Register Stage 20 step bound to the same plugintype with SecureConfig
//   9. Re-add all components to KustoExplorerSolution
import fetch from "node-fetch";
import fs from "fs";

const ORG = "https://orgd90897e4.crm.dynamics.com";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;

const UNIQUENAME = "vip_conversationdiagnostics";
const PLUGIN_TYPE_ID = "f2848cc6-3247-f111-bec6-7ced8d1dc79f";
const SOLUTION = "KustoExplorerSolution";

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 1. Snapshot
const capi = await api("GET", `customapis?$filter=uniquename eq '${UNIQUENAME}'`);
if (!capi.value.length) throw new Error("Custom API not found");
const old = capi.value[0];
console.log("Current customapi:", { id: old.customapiid, allowed: old.allowedcustomprocessingsteptype });

const reqs = await api("GET", `customapirequestparameters?$filter=_customapiid_value eq ${old.customapiid}`);
const resp = await api("GET", `customapiresponseproperties?$filter=_customapiid_value eq ${old.customapiid}`);
console.log(`Snapshot: ${reqs.value.length} request params, ${resp.value.length} response props`);
fs.writeFileSync("./customapi-snapshot.json", JSON.stringify({ old, reqs: reqs.value, resp: resp.value }, null, 2));
console.log("Snapshot saved to customapi-snapshot.json");

// 2-3. Delete steps + params
const steps = await api("GET", `sdkmessageprocessingsteps?$filter=_sdkmessageid_value eq ${old._sdkmessageid_value}&$select=sdkmessageprocessingstepid,name`);
console.log(`Found ${steps.value.length} step(s) on the message:`);
for (const s of steps.value) console.log("   ", s.sdkmessageprocessingstepid, s.name);
for (const s of steps.value) {
    try { await api("DELETE", `sdkmessageprocessingsteps(${s.sdkmessageprocessingstepid})`); console.log("Deleted step", s.sdkmessageprocessingstepid); }
    catch (e) { console.log("Could not delete step:", e.message.slice(0,200)); }
}
for (const r of reqs.value) {
    await api("DELETE", `customapirequestparameters(${r.customapirequestparameterid})`);
    console.log("Deleted reqparam", r.uniquename);
}
for (const r of resp.value) {
    await api("DELETE", `customapiresponseproperties(${r.customapiresponsepropertyid})`);
    console.log("Deleted respprop", r.uniquename);
}

// 4. Delete the customapi row
await api("DELETE", `customapis(${old.customapiid})`);
console.log("Deleted customapi", old.customapiid);

// 5. Recreate the customapi with AllowedCustomProcessingStepType=2
const newCapiBody = {
    uniquename:                       old.uniquename,
    name:                             old.name,
    displayname:                      old.displayname,
    description:                      old.description,
    bindingtype:                      old.bindingtype,
    boundentitylogicalname:           old.boundentitylogicalname,
    isfunction:                       old.isfunction,
    isprivate:                        old.isprivate,
    executeprivilegename:             old.executeprivilegename,
    allowedcustomprocessingsteptype:  2,             // SyncAndAsync
    "PluginTypeId@odata.bind":        `/plugintypes(${PLUGIN_TYPE_ID})`,
};
const newCapi = await api("POST", "customapis", newCapiBody, { "MSCRM.SolutionUniqueName": SOLUTION });
const newCapiId = newCapi.customapiid;
const newSdkMsgId = newCapi._sdkmessageid_value;
console.log("Created new customapi", newCapiId, "(sdkmessage", newSdkMsgId, ")");

// 6. Recreate request params + response property
for (const r of reqs.value) {
    await api("POST", "customapirequestparameters", {
        uniquename:       r.uniquename,
        name:             r.name,
        displayname:      r.displayname,
        description:      r.description,
        type:             r.type,
        logicalentityname: r.logicalentityname,
        isoptional:       r.isoptional,
        "CustomAPIId@odata.bind": `/customapis(${newCapiId})`,
    }, { "MSCRM.SolutionUniqueName": SOLUTION });
    console.log("Recreated reqparam", r.uniquename);
}
for (const r of resp.value) {
    await api("POST", "customapiresponseproperties", {
        uniquename:       r.uniquename,
        name:             r.name,
        displayname:      r.displayname,
        description:      r.description,
        type:             r.type,
        logicalentityname: r.logicalentityname,
        "CustomAPIId@odata.bind": `/customapis(${newCapiId})`,
    }, { "MSCRM.SolutionUniqueName": SOLUTION });
    console.log("Recreated respprop", r.uniquename);
}

// 7. Wait for the customapi-owned Stage 30 step to be auto-created
let stage30Step = null;
for (let i = 0; i < 10; i++) {
    await sleep(1500);
    const s = await api("GET", `sdkmessageprocessingsteps?$filter=_sdkmessageid_value eq ${newSdkMsgId}&$select=sdkmessageprocessingstepid,name,stage,_plugintypeid_value`);
    if (s.value.length) { stage30Step = s.value[0]; console.log("Stage 30 step ready:", stage30Step.sdkmessageprocessingstepid, "stage", stage30Step.stage); break; }
    console.log("waiting for customapi stage 30 step...");
}
// PluginTypeId@odata.bind on customapi above already binds it; just confirm.
if (stage30Step && stage30Step._plugintypeid_value !== PLUGIN_TYPE_ID) {
    console.log("Plugintype binding mismatch; rebinding via PATCH on customapi.");
    await api("PATCH", `customapis(${newCapiId})`, { "PluginTypeId@odata.bind": `/plugintypes(${PLUGIN_TYPE_ID})` });
}

// 8. Register Stage 20 step
const filt = await api("GET", `sdkmessagefilters?$select=sdkmessagefilterid&$filter=_sdkmessageid_value eq ${newSdkMsgId}&$top=1`);
const filterBind = filt.value.length ? `/sdkmessagefilters(${filt.value[0].sdkmessagefilterid})` : null;
const STAGE20_NAME = "vip.ConversationDiagnostics PreOp Token Primer (Stage 20)";
const stepBody = {
    name: STAGE20_NAME,
    description: "Primes AAD token from SecureConfig before stage-30 customapi step.",
    mode: 0, rank: 1, stage: 20,
    supporteddeployment: 0, invocationsource: 0,
    statecode: 0, statuscode: 1, asyncautodelete: false,
    "eventhandler_plugintype@odata.bind": `/plugintypes(${PLUGIN_TYPE_ID})`,
    "sdkmessageid@odata.bind": `/sdkmessages(${newSdkMsgId})`,
};
if (filterBind) stepBody["sdkmessagefilterid@odata.bind"] = filterBind;
const newStep = await api("POST", "sdkmessageprocessingsteps", stepBody, { "MSCRM.SolutionUniqueName": SOLUTION });
const newStepId = newStep.sdkmessageprocessingstepid;
console.log("Created Stage 20 step", newStepId);

// SecureConfig
const scc = await api("POST", "sdkmessageprocessingstepsecureconfigs", { secureconfig: SECURE });
await api("PATCH", `sdkmessageprocessingsteps(${newStepId})`, {
    "sdkmessageprocessingstepsecureconfigid@odata.bind": `/sdkmessageprocessingstepsecureconfigs(${scc.sdkmessageprocessingstepsecureconfigid})`,
});
console.log("Bound SecureConfig", scc.sdkmessageprocessingstepsecureconfigid);

// 9. Re-add the new ids to the solution
const components = [
    { id: newCapiId, type: 10027, name: "customapi" },
    { id: newStepId, type: 92, name: "Stage 20 step" },
];
const newReqs = await api("GET", `customapirequestparameters?$filter=_customapiid_value eq ${newCapiId}&$select=customapirequestparameterid,uniquename`);
for (const r of newReqs.value) components.push({ id: r.customapirequestparameterid, type: 10028, name: "reqparam " + r.uniquename });
const newResps = await api("GET", `customapiresponseproperties?$filter=_customapiid_value eq ${newCapiId}&$select=customapiresponsepropertyid,uniquename`);
for (const r of newResps.value) components.push({ id: r.customapiresponsepropertyid, type: 10029, name: "respprop " + r.uniquename });

for (const c of components) {
    const r = await fetch(`${ORG}/api/data/v9.2/AddSolutionComponent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ComponentId: c.id, ComponentType: c.type, SolutionUniqueName: SOLUTION, AddRequiredComponents: false }),
    });
    console.log(r.status, c.name, (await r.text()).slice(0,160));
}

console.log("\nDone.");
