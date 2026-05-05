import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const dll = fs.readFileSync("../PreOpPlugin/bin/Release/net462/vip.ConversationDiagnosticsPreOp.dll").toString("base64");
const r = await fetch("https://orgd90897e4.crm.dynamics.com/api/data/v9.2/pluginassemblies(666fc9c1-3247-f111-bec6-6045bdd91664)", { method: "PATCH", headers: {Authorization:'Bearer '+tok,'OData-Version':'4.0','Content-Type':'application/json'}, body: JSON.stringify({content:dll}) });
console.log("Upload:", r.status);
