import fs from 'fs';
import fetch from 'node-fetch';
import * as m from '@azure/msal-node';
const TENANT='1557f771-4c8e-4dbd-8b80-dd00a88e833e',CLIENT_ID='51f81489-12ee-4a9e-aaae-a2591f45987d',ORG='https://orgd90897e4.crm.dynamics.com';
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'))},afterCacheAccess:async(c)=>{if(c.cacheHasChanged)fs.writeFileSync('.token-cache.json',c.tokenCache.serialize())}};
const pca=new m.PublicClientApplication({auth:{clientId:CLIENT_ID,authority:'https://login.microsoftonline.com/'+TENANT},cache:{cachePlugin},system:{loggerOptions:{logLevel:m.LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const tok=(await pca.acquireTokenSilent({account:acc,scopes:[ORG+'/.default']})).accessToken;
const target=30425033;
// solutions table
const r=await fetch(`${ORG}/api/data/v9.2/solutions?$select=uniquename,version,versionnumber,modifiedon&$top=200`,{headers:{Authorization:'Bearer '+tok}});
const j=await r.json();
console.log('solutions raw:', JSON.stringify(j).slice(0,400));
if(!j.value){process.exit(0);}
const hit=j.value.find(s=>s.versionnumber===target);
console.log('match in solutions:', hit||'none');
console.log('all sols sorted by versionnumber desc top 10:');
j.value.sort((a,b)=>b.versionnumber-a.versionnumber).slice(0,10).forEach(s=>console.log(s.uniquename, s.versionnumber, s.modifiedon, s.publishedon));
// publishers
const r2=await fetch(`${ORG}/api/data/v9.2/publishers?$select=uniquename,versionnumber&$top=50`,{headers:{Authorization:'Bearer '+tok}});
const j2=await r2.json();
console.log('publishers:'); j2.value.forEach(p=>console.log(p.uniquename,p.versionnumber));
// app modules / sitemaps
const r3=await fetch(`${ORG}/api/data/v9.2/webresources?$filter=name eq 'cc_vip.KustoExplorer/bundle.js'&$select=name,versionnumber,modifiedon`,{headers:{Authorization:'Bearer '+tok}});
console.log('wr:', JSON.stringify(await r3.json(),null,2));
