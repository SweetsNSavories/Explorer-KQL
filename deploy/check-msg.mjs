import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
async function api(m,p,b){const r=await fetch(ORG+'/api/data/v9.2/'+p,{method:m,headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json',Accept:'application/json',Prefer:'return=representation'},body:b?JSON.stringify(b):undefined});const t=await r.text();if(!r.ok)throw new Error(r.status+' '+t);return t?JSON.parse(t):null;}
// 1. Inspect sdkmessage
const m = await api('GET',`sdkmessages(cd1ce45b-4b48-4c01-84f4-f07268c30bcb)?$select=name,iscustomprocessingstepallowed,categoryname`);
console.log('sdkmessage:', m);
// 2. Inspect customapi
const c = await api('GET',`customapis(153cad4e-6585-f011-b4cb-7c1e5217c8fa)?$select=uniquename,allowedcustomprocessingsteptype,iscustomizable,iscustomprocessingstepallowed`);
console.log('customapi:', c);
