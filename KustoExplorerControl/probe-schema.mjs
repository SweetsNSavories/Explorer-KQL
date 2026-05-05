import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
// Use Dataverse webapi to invoke our custom api with operation=schema, then look at raw payload via direct AI call
// Instead: directly hit AI metadata using a token we get via plugin... too complex. Just check what plugin returns.
// Easier: query the Dataverse customapi to call schema and see if we can also see applications. Actually let's just
// modify the plugin to log applications. Quick path: invoke Dataverse REST to call vip_conversationdiagnostics.
const ORG = "https://orgd90897e4.crm.dynamics.com";
const r = await fetch(ORG + '/api/data/v9.2/vip_conversationdiagnostics', {
  method: 'POST',
  headers: {Authorization:'Bearer '+tok,'Content-Type':'application/json'},
  body: JSON.stringify({ vip_KustoQuery:"", vip_QueryName:"", vip__startTime:"", vip__endTime:"", vip_AppId:"", vip_Operation:"schema" })
});
const j = await r.json();
const data = JSON.parse(j.vip_DiagnosticsDataJson || "[]");
console.log("Got", data.length, "tables");
