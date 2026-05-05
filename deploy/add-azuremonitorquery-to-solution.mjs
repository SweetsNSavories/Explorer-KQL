// Add new Custom API components to KustoExplorerSolution + publish.
import fetch from "node-fetch";
import fs from "fs";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";
const TENANT="1557f771-4c8e-4dbd-8b80-dd00a88e833e", CLIENT_ID="51f81489-12ee-4a9e-aaae-a2591f45987d", ORG="https://orgd90897e4.crm.dynamics.com";
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'));},afterCacheAccess:async(c)=>{if(c.cacheHasChanged) fs.writeFileSync('.token-cache.json', c.tokenCache.serialize());}};
const pca=new PublicClientApplication({auth:{clientId:CLIENT_ID,authority:`https://login.microsoftonline.com/${TENANT}`},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const r=await pca.acquireTokenSilent({account:acc,scopes:[`${ORG}/.default`]});
const H={Authorization:'Bearer '+r.accessToken,'Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0','Accept':'application/json'};
const SOL = 'KustoExplorerSolution';

const COMPONENTS = [
  { id: '1a1b520e-4148-f111-bec6-7ced8d1dc79f', type: 10027, label: 'customapi vip_azuremonitorquery' },
  { id: '354e8b0f-4148-f111-bec6-7ced8d19c872', type: 10028, label: 'req vip_KustoQuery' },
  { id: '033b0c10-4148-f111-bec7-7c1e521ab35c', type: 10028, label: 'req vip_QueryName' },
  { id: 'af25df10-4148-f111-bec7-6045bdec0f2e', type: 10028, label: 'req vip_AppId' },
  { id: '3b4e8b0f-4148-f111-bec6-7ced8d19c872', type: 10028, label: 'req vip__startTime' },
  { id: '093b0c10-4148-f111-bec7-7c1e521ab35c', type: 10028, label: 'req vip__endTime' },
  { id: 'b525df10-4148-f111-bec7-6045bdec0f2e', type: 10028, label: 'req vip_Operation' },
  { id: '2a1b520e-4148-f111-bec6-7ced8d1dc79f', type: 10029, label: 'resp vip_ResultJson' },
  { id: 'daf88814-4148-f111-bec6-7c1e5247fdba', type: 92,    label: 'step20 AzureMonitorQuery' },
];
for (const c of COMPONENTS) {
  const r = await fetch(`${ORG}/api/data/v9.2/AddSolutionComponent`, {
    method:'POST', headers:H,
    body: JSON.stringify({ ComponentId: c.id, ComponentType: c.type, SolutionUniqueName: SOL, AddRequiredComponents: false }),
  });
  console.log(`${c.label} (type ${c.type}):`, r.status, r.ok ? '' : (await r.text()).slice(0,200));
}
const xml = `<importexportxml><customapis><customapi>1a1b520e-4148-f111-bec6-7ced8d1dc79f</customapi></customapis></importexportxml>`;
for (let i=0; i<10; i++) {
  const pub = await fetch(`${ORG}/api/data/v9.2/PublishXml`, { method:'POST', headers:H, body: JSON.stringify({ ParameterXml: xml }) });
  console.log('PublishXml attempt', i+1, ':', pub.status);
  if (pub.ok) break;
  await new Promise(r=>setTimeout(r, 10000));
}
