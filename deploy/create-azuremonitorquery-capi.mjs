// Create new Custom API `vip_azuremonitorquery` with 6 request params and 1 response prop.
// Bind it to the existing plugin type vip.AzureMonitor.AzureMonitorQuerySDKPlugin.
// Register stage-20 step on the new sdkmessage. Re-bind shared SecureConfig.
// Add new components to KustoExplorerSolution. Publish.
import fetch from "node-fetch";
import fs from "fs";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";

const TENANT="1557f771-4c8e-4dbd-8b80-dd00a88e833e", CLIENT_ID="51f81489-12ee-4a9e-aaae-a2591f45987d", ORG="https://orgd90897e4.crm.dynamics.com";
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'));},afterCacheAccess:async(c)=>{if(c.cacheHasChanged) fs.writeFileSync('.token-cache.json', c.tokenCache.serialize());}};
const pca=new PublicClientApplication({auth:{clientId:CLIENT_ID,authority:`https://login.microsoftonline.com/${TENANT}`},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const r=await pca.acquireTokenSilent({account:acc,scopes:[`${ORG}/.default`]});
const H={Authorization:'Bearer '+r.accessToken,'Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0','Accept':'application/json',Prefer:'return=representation'};

const SOLUTION_UNIQUE = 'KustoExplorerSolution';
const PLUGINTYPE_ID   = '4c1943eb-3248-f111-bec6-6045bdd91664'; // vip.AzureMonitor.AzureMonitorQuerySDKPlugin
const SECURE_CONFIG_ID = '870efece-7747-f111-bec7-7c1e521ab35c'; // shared {tenantId,clientId,clientSecret}
const NEW_NAME    = 'azuremonitorquery';
const NEW_UNIQUE  = 'vip_azuremonitorquery';
const NEW_DISPLAY = 'Azure Monitor Query';
const NEW_DESC    = 'Run a KQL query against Application Insights / Azure Monitor.';

async function api(m,p,b,opts){
  const r=await fetch(ORG+'/api/data/v9.2/'+p,{method:m,headers:{...H,...(opts?.headers||{})},body:b?JSON.stringify(b):undefined});
  const t=await r.text();
  if(!r.ok) throw new Error(`${m} ${p} ${r.status}: ${t.slice(0,500)}`);
  return t?JSON.parse(t):null;
}

// 1) Create the Custom API
let existing = await api('GET',`customapis?$select=customapiid,_sdkmessageid_value&$filter=uniquename eq '${NEW_UNIQUE}'`);
let capi;
if (existing.value.length) {
  capi = existing.value[0];
  console.log('Custom API exists', capi.customapiid);
} else {
  capi = await api('POST','customapis', {
    name: NEW_NAME,
    uniquename: NEW_UNIQUE,
    displayname: NEW_DISPLAY,
    description: NEW_DESC,
    bindingtype: 0,                      // Global
    isfunction: false,
    isprivate: false,
    allowedcustomprocessingsteptype: 2,  // Async + Sync
    "PluginTypeId@odata.bind": `/plugintypes(${PLUGINTYPE_ID})`,
  });
  console.log('Created Custom API', capi.customapiid);
}
const NEW_CAPI_ID = capi.customapiid;
const NEW_SDKMSG_ID = capi._sdkmessageid_value;
console.log('  sdkmessageid =', NEW_SDKMSG_ID);

// 2) Request params
const REQ_PARAMS = [
  { uniquename: 'vip_KustoQuery',  name: 'KustoQuery',  displayname: 'KustoQuery',  description: 'KQL query to execute',                                       isoptional: true,  type: 10 },
  { uniquename: 'vip_QueryName',   name: 'QueryName',   displayname: 'QueryName',   description: 'Saved query name (used when KustoQuery is empty)',           isoptional: true,  type: 10 },
  { uniquename: 'vip_AppId',       name: 'vip_AppId',   displayname: 'App Id',      description: 'App Insights app id (overrides default from env var)',      isoptional: true,  type: 10 },
  { uniquename: 'vip__startTime',  name: '_startTime',  displayname: 'StartTime',   description: 'StartTime (ISO 8601)',                                       isoptional: true,  type: 10 },
  { uniquename: 'vip__endTime',    name: '_endTime',    displayname: 'EndTime',     description: 'EndTime (ISO 8601)',                                         isoptional: true,  type: 10 },
  { uniquename: 'vip_Operation',   name: 'vip_Operation', displayname: 'Operation', description: 'query | apps | savedqueries | schema (default: query)',     isoptional: true,  type: 10 },
];
const reqIds = [];
for (const p of REQ_PARAMS) {
  const ex = await api('GET',`customapirequestparameters?$select=customapirequestparameterid&$filter=_customapiid_value eq ${NEW_CAPI_ID} and uniquename eq '${p.uniquename}'`);
  if (ex.value.length) { reqIds.push(ex.value[0].customapirequestparameterid); console.log('req exists', p.uniquename); continue; }
  const created = await api('POST','customapirequestparameters', {
    ...p,
    "CustomAPIId@odata.bind": `/customapis(${NEW_CAPI_ID})`,
  });
  reqIds.push(created.customapirequestparameterid);
  console.log('req created', p.uniquename, created.customapirequestparameterid);
}

// 3) Response property
const RESP = { uniquename: 'vip_ResultJson', name: 'ResultJson', displayname: 'ResultJson', description: 'JSON-encoded result of the operation', type: 10 };
const respEx = await api('GET',`customapiresponseproperties?$select=customapiresponsepropertyid&$filter=_customapiid_value eq ${NEW_CAPI_ID} and uniquename eq '${RESP.uniquename}'`);
let respId;
if (respEx.value.length) { respId = respEx.value[0].customapiresponsepropertyid; console.log('resp exists', RESP.uniquename); }
else {
  const r = await api('POST','customapiresponseproperties', { ...RESP, "CustomAPIId@odata.bind": `/customapis(${NEW_CAPI_ID})` });
  respId = r.customapiresponsepropertyid;
  console.log('resp created', RESP.uniquename, respId);
}

// 4) Stage-20 step on the NEW sdkmessage. Reuse shared SecureConfig.
const STEP_NAME = 'vip.AzureMonitorQuery Token Primer (Stage 20)';
let stepEx = await api('GET',`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,_sdkmessageid_value&$filter=name eq '${STEP_NAME}'`);
let step20Id;
if (stepEx.value.length) {
  step20Id = stepEx.value[0].sdkmessageprocessingstepid;
  console.log('Stage 20 step exists', step20Id, '_sdkmessageid_value=', stepEx.value[0]._sdkmessageid_value);
  if (stepEx.value[0]._sdkmessageid_value !== NEW_SDKMSG_ID) {
    // Re-bind the existing step to the NEW sdkmessage so we can later delete the old customapi.
    await api('PATCH',`sdkmessageprocessingsteps(${step20Id})`, {
      "sdkmessageid@odata.bind": `/sdkmessages(${NEW_SDKMSG_ID})`,
    });
    console.log('  re-bound stage 20 step to new sdkmessage');
  }
} else {
  const created = await api('POST','sdkmessageprocessingsteps', {
    name: STEP_NAME, description: 'Pre-op token primer using SecureConfig',
    mode: 0, rank: 1, stage: 20,
    supporteddeployment: 0, invocationsource: 0,
    "sdkmessageid@odata.bind": `/sdkmessages(${NEW_SDKMSG_ID})`,
    "plugintypeid@odata.bind": `/plugintypes(${PLUGINTYPE_ID})`,
  });
  step20Id = created.sdkmessageprocessingstepid;
  console.log('Created stage 20 step', step20Id);
}

// 5) Re-bind shared SecureConfig row to this step (idempotent).
await api('PATCH',`sdkmessageprocessingstepsecureconfigs(${SECURE_CONFIG_ID})`, {
  "sdkmessageprocessingstepid@odata.bind": `/sdkmessageprocessingsteps(${step20Id})`,
});
console.log('Bound shared SecureConfig to stage 20 step');

// 6) Solution components: customapi (300), customapirequestparameter (301), customapiresponseproperty (302), sdkmessage (201), step (92).
//    Plugin assembly + plugin type are already in the solution.
async function addComp(id, type) {
  const r = await fetch(`${ORG}/api/data/v9.2/AddSolutionComponent`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ ComponentId: id, ComponentType: type, SolutionUniqueName: SOLUTION_UNIQUE, AddRequiredComponents: false })
  });
  console.log(`AddSolutionComponent type=${type} id=${id}:`, r.status, r.ok ? '' : (await r.text()).slice(0,200));
}
await addComp(NEW_CAPI_ID, 300);
for (const id of reqIds) await addComp(id, 301);
await addComp(respId, 302);
await addComp(step20Id, 92);

// 7) PublishXml
const xml = `<importexportxml><customapis><customapi>${NEW_CAPI_ID}</customapi></customapis></importexportxml>`;
const pub = await fetch(`${ORG}/api/data/v9.2/PublishXml`, { method: 'POST', headers: H, body: JSON.stringify({ ParameterXml: xml }) });
console.log('PublishXml:', pub.status);

console.log('\nDONE. Summary:');
console.log('  customapiid =', NEW_CAPI_ID);
console.log('  sdkmessageid =', NEW_SDKMSG_ID);
console.log('  step20Id =', step20Id);
console.log('  respId  =', respId);
console.log('  reqIds  =', reqIds);
