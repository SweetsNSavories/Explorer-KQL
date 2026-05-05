import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const r = await fetch(ORG+`/api/data/v9.2/vip_conversationdiagnostics`, {
  method:'POST',
  headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json',Accept:'application/json'},
  body: JSON.stringify({
    vip_KustoQuery:'requests | take 3 | project timestamp, name, resultCode',
    vip_QueryName:'',
    vip__startTime:'',
    vip__endTime:'',
    vip_AppId:'',
    vip_Operation:'query'
  })
});
console.log(r.status);
const t = await r.text();
const j = JSON.parse(t);
console.log('OutputJson preview:', (j.vip_DiagnosticsDataJson||'').slice(0,500));
