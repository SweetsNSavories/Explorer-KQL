import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const r = await fetch("https://orgd90897e4.crm.dynamics.com/api/data/v9.2/PublishAllXml",{method:'POST',headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'}});
console.log(r.status, await r.text());
