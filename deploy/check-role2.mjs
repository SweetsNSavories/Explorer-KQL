import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
// roleprivileges_association
const r = await fetch(ORG + `/api/data/v9.2/roles(08d61102-7247-f111-bec6-7c1e5267f8c3)?$expand=roleprivileges_association($select=name)`, {headers:{Authorization:'Bearer '+tok}});
const j = await r.json();
console.log("count =", j.roleprivileges_association?.length);
for (const p of j.roleprivileges_association || []) console.log(" ",p.name);
