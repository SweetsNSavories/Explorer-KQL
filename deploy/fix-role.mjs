import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
async function api(m,p,b){const r=await fetch(ORG+'/api/data/v9.2/'+p,{method:m,headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});const t=await r.text();if(!r.ok)throw new Error(r.status+' '+t);return t?JSON.parse(t):null;}
const j = await api('GET',`privileges?$select=privilegeid,name&$filter=name eq 'prvReadSystemUser'`);
const pid = j.value[0].privilegeid;
console.log('prvReadSystemUser =',pid);
const res = await api('POST',`roles(08d61102-7247-f111-bec6-7c1e5267f8c3)/Microsoft.Dynamics.CRM.AddPrivilegesRole`,{
  Privileges:[{PrivilegeId:pid, Depth:'Global'}]
});
console.log('added:',res);
// re-list
const v = await api('GET',`roles(08d61102-7247-f111-bec6-7c1e5267f8c3)?$expand=roleprivileges_association($select=name)`);
console.log('count after =', v.roleprivileges_association.length);
console.log('has prvReadSystemUser =', v.roleprivileges_association.some(p=>p.name==='prvReadSystemUser'));
