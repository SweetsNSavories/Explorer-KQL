import fetch from "node-fetch";
import fs from "fs";
const cache = JSON.parse(fs.readFileSync('.token-cache.json','utf8'));
const tok = Object.values(cache.AccessToken)[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const stepId = "0340b654-6585-f011-b4cb-7c1e5217c8fa";
const secId  = "765e61c2-2447-f111-bec6-6045bdd91664";

const r = await fetch(
    `${ORG}/api/data/v9.2/sdkmessageprocessingsteps(${stepId})/sdkmessageprocessingstepsecureconfigid/$ref`,
    {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${tok}`,
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            Accept: "application/json",
            "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
            "@odata.id": `${ORG}/api/data/v9.2/sdkmessageprocessingstepsecureconfigs(${secId})`,
        }),
    });
console.log("Status:", r.status, await r.text());
