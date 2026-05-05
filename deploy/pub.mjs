import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const FORM_ID = "69c22e59-1888-4d06-9afb-4d301a3a5d2f";
const r = await fetch(`https://orgd90897e4.crm.dynamics.com/api/data/v9.2/PublishXml`,{method:'POST',headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'},body:JSON.stringify({ParameterXml:`<importexportxml><systemforms><systemform>${FORM_ID}</systemform></systemforms></importexportxml>`})});
console.log('PublishXml:', r.status);
