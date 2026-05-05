import fetch from "node-fetch";
import fs from "fs";

const cache = JSON.parse(fs.readFileSync('.token-cache.json','utf8'));
const tok = Object.values(cache.AccessToken)[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const PLUGIN_TYPE_ID = "04aad6bf-6385-f011-b4cb-6045bdd6a665";
const SDK_MESSAGE_ID = "cd1ce45b-4b48-4c01-84f4-f07268c30bcb";
const CUSTOMAPI_ID   = "153cad4e-6585-f011-b4cb-7c1e5217c8fa";
const SECURE_ID      = "765e61c2-2447-f111-bec6-6045bdd91664";

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

// 1. Need an sdkmessagefilter for the message — find one (any).
const filt = await api("GET", `sdkmessagefilters?$select=sdkmessagefilterid,primaryobjecttypecode&$filter=_sdkmessageid_value eq ${SDK_MESSAGE_ID}&$top=5`);
console.log("Filters:", filt.value);

// 2. Allow custom processing steps on the Custom API.
await api("PATCH", `customapis(${CUSTOMAPI_ID})`, { allowedcustomprocessingsteptype: 2 });
console.log("Custom API now allows extra steps.");

// 3. Create the post-op step (stage 40).
const stepBody = {
    name: "vip_conversationdiagnostics post-op (secure config)",
    description: "Post-operation step to inject secure config",
    mode: 0,                  // synchronous
    rank: 1,
    stage: 40,                // PostOperation
    supporteddeployment: 0,
    invocationsource: 0,
    statecode: 0,
    statuscode: 1,
    asyncautodelete: false,
    "eventhandler_plugintype@odata.bind": `/plugintypes(${PLUGIN_TYPE_ID})`,
    "sdkmessageid@odata.bind": `/sdkmessages(${SDK_MESSAGE_ID})`,
    "sdkmessageprocessingstepsecureconfigid@odata.bind": `/sdkmessageprocessingstepsecureconfigs(${SECURE_ID})`,
};
if (filt.value.length) {
    stepBody["sdkmessagefilterid@odata.bind"] = `/sdkmessagefilters(${filt.value[0].sdkmessagefilterid})`;
}
const step = await api("POST", "sdkmessageprocessingsteps", stepBody);
console.log("Created step:", step.sdkmessageprocessingstepid);
