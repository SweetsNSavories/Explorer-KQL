// Check if "PPAC Kusto Reader" role is in the solution and its components.
import fetch from "node-fetch";
import fs from "fs";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";
const TENANT="1557f771-4c8e-4dbd-8b80-dd00a88e833e", CLIENT_ID="51f81489-12ee-4a9e-aaae-a2591f45987d", ORG="https://orgd90897e4.crm.dynamics.com";
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'));},afterCacheAccess:async(c)=>{if(c.cacheHasChanged)fs.writeFileSync('.token-cache.json',c.tokenCache.serialize());}};
const pca=new PublicClientApplication({auth:{clientId:CLIENT_ID,authority:'https://login.microsoftonline.com/'+TENANT},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const r=await pca.acquireTokenSilent({account:acc,scopes:[ORG+'/.default']});
const H={Authorization:'Bearer '+r.accessToken,Accept:'application/json','Content-Type':'application/json'};
async function api(m,p){const r=await fetch(ORG+'/api/data/v9.2/'+p,{headers:H,method:m});const t=await r.text();if(!r.ok)throw new Error(`${m} ${p} ${r.status}: ${t.slice(0,300)}`);return t?JSON.parse(t):null;}

// list our solutions
const sols = await api('GET',"solutions?$select=solutionid,uniquename,friendlyname,ismanaged&$filter=contains(uniquename,'Kusto') or contains(uniquename,'kusto') or contains(uniquename,'Conversation') or contains(uniquename,'vip')");
console.log('Candidate solutions:');
for (const s of sols.value) console.log(' -', s.uniquename, s.solutionid, 'managed='+s.ismanaged);

// for each, list components
for (const s of sols.value) {
  const comps = await api('GET',`solutioncomponents?$select=componenttype,objectid&$filter=_solutionid_value eq ${s.solutionid}`);
  const byType = {};
  for (const c of comps.value) byType[c.componenttype] = (byType[c.componenttype]||0)+1;
  console.log(`\n${s.uniquename} components by type:`, byType);
  // 20 = SecurityRole
  const roles = comps.value.filter(c => c.componenttype === 20);
  for (const rc of roles) {
    const role = await api('GET',`roles(${rc.objectid})?$select=name,roleid`);
    console.log('   role component:', role.name, role.roleid);
  }
}

// also check which solution(s) "PPAC Kusto Reader" lives in
const role = await api('GET',"roles?$select=roleid,name&$filter=name eq 'PPAC Kusto Reader'");
console.log('\nPPAC Kusto Reader role rows:', role.value.length);
for (const r of role.value) {
  console.log(' role:', r.roleid);
  const sc = await api('GET',`solutioncomponents?$select=componenttype,_solutionid_value&$filter=objectid eq ${r.roleid}&$expand=solutionid($select=uniquename)`);
  for (const c of sc.value) console.log('   in solution:', c.solutionid?.uniquename, 'type='+c.componenttype);
}
