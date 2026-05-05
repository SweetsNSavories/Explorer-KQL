import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8')).AccessToken)[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
async function get(p){const r=await fetch(`${ORG}/api/data/v9.2/${p}`,{headers:{Authorization:'Bearer '+tok,Accept:'application/json'}});return JSON.parse(await r.text());}

const sc = await get(`solutioncomponents?$select=componenttype,solutioncomponentid,rootcomponentbehavior&$expand=solutionid($select=uniquename,ismanaged)&$filter=objectid eq 153cad4e-6585-f011-b4cb-7c1e5217c8fa`);
console.log("CustomAPI solution components:", JSON.stringify(sc.value, null, 2));

const pkgRows = await get(`pluginpackages?$select=name,uniquename,version,solutionid&$filter=uniquename eq 'vip_LogsQueryClientPlugin'`);
console.log("\nPlugin package:", JSON.stringify(pkgRows.value, null, 2));
