import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const r = await fetch(ORG + `/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged,version&$filter=ismanaged eq false and isvisible eq true`, {headers:{Authorization:'Bearer '+tok}});
const j = await r.json();
console.log(j.value.map(s => `${s.uniquename}  (${s.friendlyname})  v${s.version}  id=${s.solutionid}`).join('\n'));
