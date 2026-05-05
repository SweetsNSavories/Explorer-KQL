import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const STEP_ID = "4c684d53-3347-f111-bec6-7c1e5267f8c3";
const CLIENT_SECRET = process.env.AAD_CLIENT_SECRET || (() => { throw new Error('Set AAD_CLIENT_SECRET env var'); })();
const SECURE = JSON.stringify({tenantId:"1557f771-4c8e-4dbd-8b80-dd00a88e833e",clientId:"d84afeca-cc94-4e87-aec0-b1c70d799eb8",clientSecret:CLIENT_SECRET});
async function api(m,p,b){const r=await fetch(ORG+'/api/data/v9.2/'+p,{method:m,headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json',Accept:'application/json',Prefer:'return=representation'},body:b?JSON.stringify(b):undefined});const t=await r.text();if(!r.ok)throw new Error(`${m} ${p} ${r.status}: ${t}`);return t?JSON.parse(t):null;}
// 1. Create the secureconfig row first
const scc = await api('POST','sdkmessageprocessingstepsecureconfigs',{secureconfig:SECURE});
console.log('created scc:',scc.sdkmessageprocessingstepsecureconfigid);
// 2. Try to bind it on the locked step
try {
  await api('PATCH',`sdkmessageprocessingsteps(${STEP_ID})`,{
    "sdkmessageprocessingstepsecureconfigid@odata.bind":`/sdkmessageprocessingstepsecureconfigs(${scc.sdkmessageprocessingstepsecureconfigid})`
  });
  console.log('bound!');
} catch (e) { console.log('bind failed:', e.message.slice(0,500)); }
