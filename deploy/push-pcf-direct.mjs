import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";
const TENANT="1557f771-4c8e-4dbd-8b80-dd00a88e833e", CLIENT_ID="51f81489-12ee-4a9e-aaae-a2591f45987d", ORG="https://orgd90897e4.crm.dynamics.com";
const cachePlugin = { beforeCacheAccess: async(ctx)=>{ if(fs.existsSync('.token-cache.json')) ctx.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8')); }, afterCacheAccess: async(ctx)=>{ if(ctx.cacheHasChanged) fs.writeFileSync('.token-cache.json', ctx.tokenCache.serialize()); } };
const pca = new PublicClientApplication({ auth:{ clientId:CLIENT_ID, authority:`https://login.microsoftonline.com/${TENANT}`}, cache:{cachePlugin}, system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc = (await pca.getTokenCache().getAllAccounts())[0];
const r = await pca.acquireTokenSilent({account:acc, scopes:[`${ORG}/.default`]});
const tok = r.accessToken;
const H = {Authorization:'Bearer '+tok,'Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0','Accept':'application/json'};

const OUT = path.resolve("../KustoExplorerControl/out/controls/KustoExplorer");
const files = [
  { local: "bundle.js", remote: "cc_vip.KustoExplorer/bundle.js", type: 3 },         // 3 = Script (JScript)
  { local: "css/KustoExplorer.css", remote: "cc_vip.KustoExplorer/css/KustoExplorer.css", type: 2 }, // 2 = CSS
];
// also discover hashed .ttf
const root = fs.readdirSync(OUT);
for (const f of root) {
  if (f.endsWith(".ttf")) {
    files.push({ local: f, remote: `cc_vip.KustoExplorer/${f}`, type: 5, isFont: true }); // 5 = data file
  }
}

async function findWr(name) {
  const r = await fetch(`${ORG}/api/data/v9.2/webresourceset?$filter=name eq '${encodeURIComponent(name).replace(/'/g, "''")}'&$select=webresourceid,name`, { headers: H });
  const j = await r.json();
  return j.value?.[0];
}

const updatedIds = [];
for (const f of files) {
  const full = path.join(OUT, f.local.replace(/\//g, path.sep));
  if (!fs.existsSync(full)) { console.log("skip (missing):", full); continue; }
  const buf = fs.readFileSync(full);
  const b64 = buf.toString("base64");
  console.log(`${f.remote}  bytes=${buf.length}  b64=${b64.length}`);
  const ex = await findWr(f.remote);
  if (ex) {
    const u = await fetch(`${ORG}/api/data/v9.2/webresourceset(${ex.webresourceid})`, { method: "PATCH", headers: H, body: JSON.stringify({ content: b64 }) });
    console.log(" PATCH:", u.status, u.statusText);
    if (!u.ok) console.log("  body:", await u.text());
    updatedIds.push(ex.webresourceid);
  } else {
    const create = { name: f.remote, displayname: f.remote, webresourcetype: f.type, content: b64 };
    const u = await fetch(`${ORG}/api/data/v9.2/webresourceset`, { method: "POST", headers: H, body: JSON.stringify(create) });
    console.log(" CREATE:", u.status, u.statusText);
    const loc = u.headers.get("OData-EntityId");
    if (loc) {
      const id = loc.match(/\(([^)]+)\)/)?.[1];
      if (id) updatedIds.push(id);
    }
  }
}

// Bump customcontrol version so cache key changes
const cc = await fetch(`${ORG}/api/data/v9.2/customcontrols?$filter=name eq 'vip_vip.KustoExplorer'&$select=customcontrolid,version`, { headers: H }).then(r => r.json());
if (cc.value?.[0]) {
  const id = cc.value[0].customcontrolid;
  const cur = cc.value[0].version || "0.0.0";
  const parts = cur.split(".").map(n => parseInt(n, 10) || 0);
  parts[2] = (parts[2] || 0) + 1;
  const next = parts.join(".");
  const p = await fetch(`${ORG}/api/data/v9.2/customcontrols(${id})`, { method: "PATCH", headers: H, body: JSON.stringify({ version: next }) });
  console.log(`customcontrol version ${cur} -> ${next}:`, p.status);
}

// Targeted publish (webresources + customcontrol + entity form)
const wrXml = updatedIds.map(id => `<webresource>${id}</webresource>`).join("");
const ccId = cc.value?.[0]?.customcontrolid;
const xml = `<importexportxml>${wrXml ? `<webresources>${wrXml}</webresources>` : ""}${ccId ? `<customcontrols><customcontrol>${ccId}</customcontrol></customcontrols>` : ""}<entities><entity>systemuser</entity></entities></importexportxml>`;
const pub = await fetch(`${ORG}/api/data/v9.2/PublishXml`, { method: "POST", headers: H, body: JSON.stringify({ ParameterXml: xml }) });
console.log("PublishXml:", pub.status, pub.statusText);
