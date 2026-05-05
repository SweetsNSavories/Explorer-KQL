import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
// Find any existing solutioncomponent rows whose objectid matches our customapi/params
const ids = ["153cad4e-6585-f011-b4cc-7c1e5217c8fa","9b7bc61e-6e47-f111-bec7-6045bdec0f2e","9c4bc720-6e47-f111-bec6-7c1e5267f8c3"];
const filter = ids.map(i => `objectid eq ${i}`).join(' or ');
const r = await fetch(ORG + `/api/data/v9.2/solutioncomponents?$select=componenttype,objectid,solutioncomponentid&$filter=${encodeURIComponent(filter)}`, {headers:{Authorization:'Bearer '+tok}});
const j = await r.json();
console.log(j.value);
