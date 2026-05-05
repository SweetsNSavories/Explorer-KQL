import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const r = await fetch(ORG+`/api/data/v9.2/EntityDefinitions(LogicalName='systemform')/Attributes?$select=LogicalName`,{headers:{Authorization:'Bearer '+tok,Accept:'application/json'}});
const j = JSON.parse(await r.text());
const names = j.value.map(a => a.LogicalName).filter(n => /head|dens|navig|style|chrome|present/i.test(n));
console.log(names);
