import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const r = await fetch(ORG+`/api/data/v9.2/privileges?$select=privilegeid,name&$filter=name eq 'prvReadUser' or name eq 'prvReadSystemUser'`, {headers:{Authorization:'Bearer '+tok}});
console.log(await r.text());
