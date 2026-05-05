import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const r = await fetch(ORG+`/api/data/v9.2/customapis(153cad4e-6585-f011-b4cb-7c1e5217c8fa)`, {
  method:'PATCH', headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0','MSCRM.SolutionUniqueName':'KustoExplorerSolution'},
  body: JSON.stringify({ allowedcustomprocessingsteptype: 2 })
});
console.log('PATCH:', r.status, await r.text());
const v = await fetch(ORG+`/api/data/v9.2/customapis(153cad4e-6585-f011-b4cb-7c1e5217c8fa)?$select=allowedcustomprocessingsteptype`, {headers:{Authorization:'Bearer '+tok}});
console.log('verify:', await v.text());
