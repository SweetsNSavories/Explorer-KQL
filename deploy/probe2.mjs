import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const FORM_ID = "69c22e59-1888-4d06-9afb-4d301a3a5d2f";
const r = await fetch(ORG + `/api/data/v9.2/systemforms(${FORM_ID})?$select=formxml`, {headers:{Authorization:'Bearer '+tok}});
const j = JSON.parse(await r.text());
let baseXml = j.formxml;
async function tryVal(v){
  const xml = baseXml.replace(/<form\b[^>]*>/, `<form headerdensity="${v}">`);
  const r = await fetch(ORG + `/api/data/v9.2/systemforms(${FORM_ID})`, {method:'PATCH',headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'}, body: JSON.stringify({formxml:xml})});
  if (r.ok) console.log(v, '=> OK');
}
for (const v of ["None","Low","Medium","High","Hidden","Standard","Tall","Short","Single","Double","Auto","FormType1","Slim","Thin","Narrow","Tab","NoTitle","Title","Image"]) {
  await tryVal(v);
}
