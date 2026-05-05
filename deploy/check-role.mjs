import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const r = await fetch(ORG + `/api/data/v9.2/roles(08d61102-7247-f111-bec6-7c1e5267f8c3)/Microsoft.Dynamics.CRM.RetrieveRolePrivileges()`, {headers:{Authorization:'Bearer '+tok}});
const j = await r.json();
console.log("privileges count =", j.RolePrivileges?.length);
// fetch names
for (const p of j.RolePrivileges || []) {
  const pr = await fetch(ORG + `/api/data/v9.2/privileges(${p.PrivilegeId})?$select=name`, {headers:{Authorization:'Bearer '+tok}});
  const pj = await pr.json();
  console.log(`  depth=${p.Depth}\t${pj.name}`);
}
