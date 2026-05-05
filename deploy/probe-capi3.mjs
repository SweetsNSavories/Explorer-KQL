import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
async function tryAdd(type){
  const r = await fetch(ORG + `/api/data/v9.2/AddSolutionComponent`, {
    method:'POST',
    headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'},
    body: JSON.stringify({ ComponentId:"153cad4e-6585-f011-b4cc-7c1e5217c8fa", ComponentType:type, SolutionUniqueName:"KustoExplorerSolution", AddRequiredComponents:false }),
  });
  console.log(type, '=>', r.status, (await r.text()).slice(0,250));
}
for (const t of [10026, 10027, 10028, 10029, 10030, 50, 52, 53]) await tryAdd(t);
