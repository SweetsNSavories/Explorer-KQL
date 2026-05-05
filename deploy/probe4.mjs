import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const FORM_ID = "69c22e59-1888-4d06-9afb-4d301a3a5d2f";
const r = await fetch(ORG + `/api/data/v9.2/systemforms(${FORM_ID})?$select=formxml`, {headers:{Authorization:'Bearer '+tok}});
const j = JSON.parse(await r.text());
let baseXml = j.formxml;
async function tryAttr(attr, val){
  const xml = baseXml.replace(/<form\b[^>]*>/, `<form headerdensity="Low" ${attr}="${val}">`);
  const r = await fetch(ORG + `/api/data/v9.2/systemforms(${FORM_ID})`, {method:'PATCH',headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'}, body: JSON.stringify({formxml:xml})});
  const t = await r.text();
  if (r.ok) console.log(attr, '=', val, '=> OK');
  else {
    const m = t.match(/'([^']+)' attribute is invalid/);
    if (m) console.log(attr, '=', val, '=> INVALID VALUE (attr exists)');
    // else attr not in schema
  }
}
const attrs = ["showImage","showImageInForm","showentityimage","showImageInHeader","showFormHeader","showheader","headerVisible","showbody","showtitle","showbreadcrumb","showname","formstyle","style","layout","hideheader","hidebody"];
for (const a of attrs) {
  await tryAttr(a, "false");
  await tryAttr(a, "true");
  await tryAttr(a, "0");
  await tryAttr(a, "1");
}
