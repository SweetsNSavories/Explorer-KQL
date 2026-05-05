// Update only the plugin assembly content + publish. No step changes.
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";
const TENANT="1557f771-4c8e-4dbd-8b80-dd00a88e833e", CLIENT_ID="51f81489-12ee-4a9e-aaae-a2591f45987d", ORG="https://orgd90897e4.crm.dynamics.com";
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'));},afterCacheAccess:async(c)=>{if(c.cacheHasChanged)fs.writeFileSync('.token-cache.json',c.tokenCache.serialize());}};
const pca=new PublicClientApplication({auth:{clientId:CLIENT_ID,authority:'https://login.microsoftonline.com/'+TENANT},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const r=await pca.acquireTokenSilent({account:acc,scopes:[ORG+'/.default']});
const H={Authorization:'Bearer '+r.accessToken,Accept:'application/json','Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0'};

const DLL = path.resolve("..","PreOpPlugin","bin","Release","net462","vip.AzureMonitorQuery.dll");
const ASSEMBLY_NAME = "vip.AzureMonitorQuery";
const dllB64 = fs.readFileSync(DLL).toString("base64");
console.log(`DLL ${DLL} size=${fs.statSync(DLL).size}`);

const find = await fetch(`${ORG}/api/data/v9.2/pluginassemblies?$select=pluginassemblyid&$filter=name eq '${ASSEMBLY_NAME}'`, { headers: H }).then(r=>r.json());
if (!find.value?.[0]) throw new Error("assembly not found");
const id = find.value[0].pluginassemblyid;
const u = await fetch(`${ORG}/api/data/v9.2/pluginassemblies(${id})`, { method: "PATCH", headers: H, body: JSON.stringify({ content: dllB64 }) });
console.log("PATCH assembly:", u.status, u.statusText);
if (!u.ok) console.log(await u.text());

// Publish (forces sandbox to reload assembly)
const xml = `<importexportxml><pluginassemblies><pluginassembly>${id}</pluginassembly></pluginassemblies></importexportxml>`;
const pub = await fetch(`${ORG}/api/data/v9.2/PublishXml`, { method: "POST", headers: H, body: JSON.stringify({ ParameterXml: xml }) });
console.log("PublishXml:", pub.status, pub.statusText);
