import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const SOL = "60d1fecb-6c27-4757-9bed-70dcda4c5e94";
const r = await fetch(ORG + `/api/data/v9.2/solutioncomponents?$select=componenttype,objectid&$filter=_solutionid_value eq ${SOL} and objectid eq 153cad4e-6585-f011-b4cc-7c1e5217c8fa`, {headers:{Authorization:'Bearer '+tok}});
console.log(await r.text());
