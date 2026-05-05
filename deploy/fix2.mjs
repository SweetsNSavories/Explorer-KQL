import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const r = await fetch(ORG+`/api/data/v9.2/roles(08d61102-7247-f111-bec6-7c1e5267f8c3)/Microsoft.Dynamics.CRM.AddPrivilegesRole`, {
  method:'POST', headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'},
  body: JSON.stringify({Privileges:[{PrivilegeId:'76faad15-bc44-4f4d-84dc-dd1e1dda74d9', Depth:'Global'}]})
});
console.log(r.status, await r.text());
const v = await fetch(ORG+`/api/data/v9.2/roles(08d61102-7247-f111-bec6-7c1e5267f8c3)?$expand=roleprivileges_association($select=name)`, {headers:{Authorization:'Bearer '+tok}});
const j = await v.json();
console.log('count =', j.roleprivileges_association.length, 'has prvReadUser =', j.roleprivileges_association.some(p=>p.name==='prvReadUser'));
