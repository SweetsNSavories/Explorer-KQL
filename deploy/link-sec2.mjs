import fetch from "node-fetch";
import fs from "fs";
const cache = JSON.parse(fs.readFileSync('.token-cache.json','utf8'));
const tok = Object.values(cache.AccessToken)[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const stepId = "0340b654-6585-f011-b4cb-7c1e5217c8fa";
const secId  = "765e61c2-2447-f111-bec6-6045bdd91664";

// Get current stage.
let r = await fetch(`${ORG}/api/data/v9.2/sdkmessageprocessingsteps(${stepId})?$select=stage`,
    { headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" } });
const cur = JSON.parse(await r.text());
console.log("Current stage:", cur.stage);

// Try PATCH that simultaneously sets stage=40 and links secure config.
r = await fetch(`${ORG}/api/data/v9.2/sdkmessageprocessingsteps(${stepId})`, {
    method: "PATCH",
    headers: {
        Authorization: `Bearer ${tok}`,
        "OData-MaxVersion": "4.0", "OData-Version": "4.0",
        Accept: "application/json", "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
        "stage": 40,
        "sdkmessageprocessingstepsecureconfigid@odata.bind": `/sdkmessageprocessingstepsecureconfigs(${secId})`,
    }),
});
console.log("Set stage 40 + link:", r.status, await r.text());

// Revert stage back.
r = await fetch(`${ORG}/api/data/v9.2/sdkmessageprocessingsteps(${stepId})`, {
    method: "PATCH",
    headers: {
        Authorization: `Bearer ${tok}`,
        "OData-MaxVersion": "4.0", "OData-Version": "4.0",
        Accept: "application/json", "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ "stage": cur.stage }),
});
console.log("Revert stage:", r.status, await r.text());
