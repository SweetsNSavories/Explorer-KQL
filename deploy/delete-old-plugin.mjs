import fetch from "node-fetch";
import fs from "fs";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'));},afterCacheAccess:async()=>{}};
const pca=new PublicClientApplication({auth:{clientId:'51f81489-12ee-4a9e-aaae-a2591f45987d',authority:'https://login.microsoftonline.com/1557f771-4c8e-4dbd-8b80-dd00a88e833e'},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const r=await pca.acquireTokenSilent({account:acc,scopes:['https://orgd90897e4.crm.dynamics.com/.default']});
const H={Authorization:'Bearer '+r.accessToken,Accept:'application/json','Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0'};
const ORG = 'https://orgd90897e4.crm.dynamics.com';
const SOLUTION_UNIQUE = 'KustoExplorerSolution';

const OLD_ASSEMBLY  = '666fc9c1-3247-f111-bec6-6045bdd91664';
const OLD_PLUGINTYPE= 'f2848cc6-3247-f111-bec6-7ced8d1dc79f';
const OLD_STEP20    = '488d1dce-7747-f111-bec6-6045bdd91664';
const OLD_STEP30    = '6cddb1c8-7747-f111-bec7-7c1e521ab35c';

async function rmFromSolution(objectId, componentType) {
  const r = await fetch(`${ORG}/api/data/v9.2/RemoveSolutionComponent`, {
    method:'POST', headers:H,
    body: JSON.stringify({ ComponentId: objectId, ComponentType: componentType, SolutionUniqueName: SOLUTION_UNIQUE })
  });
  console.log(`RemoveSolutionComponent type=${componentType} id=${objectId}:`, r.status, r.ok ? '' : (await r.text()).slice(0,200));
}
async function del(path) {
  const r = await fetch(`${ORG}/api/data/v9.2/${path}`, { method:'DELETE', headers:H });
  console.log(`DELETE ${path}:`, r.status, r.ok ? '' : (await r.text()).slice(0,300));
}

// Remove from solution first (best effort), then delete in dependency order: steps -> plugintype -> assembly
await rmFromSolution(OLD_STEP30, 92);
await rmFromSolution(OLD_STEP20, 92);
await rmFromSolution(OLD_PLUGINTYPE, 90);
await rmFromSolution(OLD_ASSEMBLY, 91);

await del(`sdkmessageprocessingsteps(${OLD_STEP30})`);
await del(`sdkmessageprocessingsteps(${OLD_STEP20})`);
await del(`plugintypes(${OLD_PLUGINTYPE})`);
await del(`pluginassemblies(${OLD_ASSEMBLY})`);

const pub = await fetch(`${ORG}/api/data/v9.2/PublishAllXml`, { method:'POST', headers:H });
console.log('PublishAllXml:', pub.status);
