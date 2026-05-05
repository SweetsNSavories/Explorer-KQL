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
  const t = await r.text();
  if (r.ok) console.log(type, '=> OK');
  else if (!t.includes('does not exist')) console.log(type, '=>', t.slice(0,200));
}
for (const t of [10026, 10027, 10028, 10029, 10030, 10031, 9100, 9101, 9102, 50, 51, 52, 53, 54]) await tryAdd(t);
