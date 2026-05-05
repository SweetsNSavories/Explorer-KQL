// Register the renamed plugin: assembly vip.AzureMonitorQuery, type vip.AzureMonitor.AzureMonitorQuerySDKPlugin
// Creates stage 20 (TokenPrimer) + stage 30 (CustomAPI impl) on vip_conversationdiagnostics,
// reuses the existing SecureConfig row on stage 20, and adds new components to KustoExplorerSolution.
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";

const ORG = "https://orgd90897e4.crm.dynamics.com";
const TENANT = "1557f771-4c8e-4dbd-8b80-dd00a88e833e";
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";

const ASSEMBLY_NAME = "vip.AzureMonitorQuery";
const TYPE_NAME     = "vip.AzureMonitor.AzureMonitorQuerySDKPlugin";
const DLL = path.resolve("..","PreOpPlugin","bin","Release","net462","vip.AzureMonitorQuery.dll");

const SDK_MESSAGE_ID         = "16ff39be-0d64-4f70-82a9-e07f4c1b5405"; // vip_conversationdiagnostics
const CUSTOMAPI_ID           = "508876c2-7747-f111-bec7-7c1e521ab35c"; // for re-binding plugintype
const SOLUTION_UNIQUE_NAME   = "KustoExplorerSolution";
const SECURE_CONFIG_ID_KNOWN = "870efece-7747-f111-bec7-7c1e521ab35c"; // existing scc row

const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'));},afterCacheAccess:async(c)=>{if(c.cacheHasChanged)fs.writeFileSync('.token-cache.json',c.tokenCache.serialize());}};
const pca=new PublicClientApplication({auth:{clientId:CLIENT_ID,authority:'https://login.microsoftonline.com/'+TENANT},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const r=await pca.acquireTokenSilent({account:acc,scopes:[ORG+'/.default']});
const H={Authorization:'Bearer '+r.accessToken,Accept:'application/json','Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0',Prefer:'return=representation'};
async function api(m,p,b){const r=await fetch(ORG+'/api/data/v9.2/'+p,{method:m,headers:H,body:b?JSON.stringify(b):undefined});const t=await r.text();if(!r.ok) throw new Error(`${m} ${p} ${r.status}: ${t.slice(0,400)}`);return t?JSON.parse(t):null;}

const dllB64 = fs.readFileSync(DLL).toString("base64");
console.log(`DLL ${DLL} size=${fs.statSync(DLL).size}`);

// 1) assembly
let asmRows = await api('GET',`pluginassemblies?$select=pluginassemblyid&$filter=name eq '${ASSEMBLY_NAME}'`);
let assemblyId;
if (asmRows.value.length) {
  assemblyId = asmRows.value[0].pluginassemblyid;
  console.log("Updating existing assembly", assemblyId);
  await api('PATCH', `pluginassemblies(${assemblyId})`, { content: dllB64 });
} else {
  const created = await api('POST','pluginassemblies', {
    name: ASSEMBLY_NAME, content: dllB64, sourcetype: 0, isolationmode: 2,
  });
  assemblyId = created.pluginassemblyid;
  console.log("Created assembly", assemblyId);
}

// 2) plugintype
let ptRows = await api('GET',`plugintypes?$select=plugintypeid&$filter=typename eq '${TYPE_NAME}' and _pluginassemblyid_value eq ${assemblyId}`);
let pluginTypeId;
if (ptRows.value.length) {
  pluginTypeId = ptRows.value[0].plugintypeid;
  console.log("Plugin type exists", pluginTypeId);
} else {
  const created = await api('POST','plugintypes', {
    typename: TYPE_NAME, friendlyname: TYPE_NAME, name: TYPE_NAME,
    "pluginassemblyid@odata.bind": `/pluginassemblies(${assemblyId})`,
  });
  pluginTypeId = created.plugintypeid;
  console.log("Created plugin type", pluginTypeId);
}

// 3) stage 20 step (TokenPrimer) bound to existing SecureConfig
const STEP20_NAME = "vip.AzureMonitorQuery TokenPrimer (Stage 20)";
let s20 = await api('GET',`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=name eq '${STEP20_NAME}'`);
let step20Id;
if (s20.value.length) {
  step20Id = s20.value[0].sdkmessageprocessingstepid;
  console.log("Stage 20 exists", step20Id);
} else {
  const created = await api('POST','sdkmessageprocessingsteps', {
    name: STEP20_NAME, description: "TokenPrimer for AzureMonitor query",
    mode: 0,           // Synchronous
    rank: 1,
    stage: 20,         // PreOperation
    supporteddeployment: 0,
    invocationsource: 0,
    "sdkmessageid@odata.bind": `/sdkmessages(${SDK_MESSAGE_ID})`,
    "plugintypeid@odata.bind": `/plugintypes(${pluginTypeId})`,
    "sdkmessageprocessingstepsecureconfigid@odata.bind": `/sdkmessageprocessingstepsecureconfigs(${SECURE_CONFIG_ID_KNOWN})`,
  });
  step20Id = created.sdkmessageprocessingstepid;
  console.log("Created stage 20", step20Id);
}

// 4) Repoint the Custom API implementation to the new plugin type.
//    For Custom APIs, "stage 30" is the binding on the customapi entity itself
//    via the PluginTypeId lookup (single-valued).
const repoint = await fetch(`${ORG}/api/data/v9.2/customapis(${CUSTOMAPI_ID})`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ "PluginTypeId@odata.bind": `/plugintypes(${pluginTypeId})` }),
});
console.log("Repoint customapi.PluginTypeId:", repoint.status, repoint.statusText);
if (!repoint.ok) console.log("  body:", await repoint.text());
const step30Id = null; // not a separate SDK step

// 5) Add new components to solution
const sols = await api('GET',`solutions?$select=solutionid&$filter=uniquename eq '${SOLUTION_UNIQUE_NAME}'`);
const solId = sols.value[0].solutionid;
async function addComp(id, type) {
  try {
    await fetch(`${ORG}/api/data/v9.2/AddSolutionComponent`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ ComponentId: id, ComponentType: type, SolutionUniqueName: SOLUTION_UNIQUE_NAME, AddRequiredComponents: false }),
    }).then(async r => console.log(`AddSolutionComponent type=${type} id=${id}: ${r.status}`));
  } catch (e) { console.log("addcomp failed:", e.message); }
}
await addComp(assemblyId, 91);   // PluginAssembly
await addComp(pluginTypeId, 90); // PluginType
await addComp(step20Id, 92);     // SdkMessageProcessingStep
// (no separate stage-30 step; the customapi component itself owns the impl binding)

// 6) Publish
const xml = `<importexportxml><pluginassemblies><pluginassembly>${assemblyId}</pluginassembly></pluginassemblies></importexportxml>`;
const pub = await fetch(`${ORG}/api/data/v9.2/PublishXml`, { method: 'POST', headers: H, body: JSON.stringify({ ParameterXml: xml }) });
console.log("PublishXml:", pub.status, pub.statusText);

console.log("\nIDs:");
console.log("  assemblyId =", assemblyId);
console.log("  pluginTypeId =", pluginTypeId);
console.log("  step20Id =", step20Id);
console.log("  step30Id =", step30Id);
