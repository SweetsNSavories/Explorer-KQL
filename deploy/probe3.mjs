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
const tests = ["Compressed","Expanded","Maximum","Minimum","HeaderDensityHigh","HeaderDensityLow","HeaderDensityNone","Density1","Density2","Density3","Card","NoCard","NoBody","Bare","Empty","Min","Max","Mini","Headerless","BodyOnly","TabsOnly","Reduced","Full","Tight","Loose","Spacious","Slim","Lean","Tiny","X","Y","Z","HD","NDR","Default0","Default1","Default2","Density0","Form","FormBody","BodyHeader","TitleBar","CommandBar","NoTitleBar","HeaderHidden","HeaderShown","HeaderCollapsed","Collapsed","Expanded","Visible","Invisible","FullHeader","HalfHeader","QuarterHeader"];
for (const v of tests) await tryVal(v);
