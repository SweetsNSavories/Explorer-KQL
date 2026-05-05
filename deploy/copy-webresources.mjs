import fs from 'fs';
import fetch from 'node-fetch';
import { PublicClientApplication, LogLevel } from '@azure/msal-node';
const TENANT='1557f771-4c8e-4dbd-8b80-dd00a88e833e', CLIENT_ID='51f81489-12ee-4a9e-aaae-a2591f45987d', ORG='https://orgd90897e4.crm.dynamics.com';
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'))},afterCacheAccess:async(c)=>{if(c.cacheHasChanged)fs.writeFileSync('.token-cache.json',c.tokenCache.serialize())}};
const pca=new PublicClientApplication({auth:{clientId:CLIENT_ID,authority:'https://login.microsoftonline.com/'+TENANT},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const tok=(await pca.acquireTokenSilent({account:acc,scopes:[ORG+'/.default']})).accessToken;
const H={Authorization:'Bearer '+tok,'Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0','Accept':'application/json'};

// Get the three cc_vip.* webresources and copy them under vip_vip.* names
const list=await (await fetch(`${ORG}/api/data/v9.2/webresourceset?$filter=startswith(name,'cc_vip.KustoExplorer/')&$select=name,content,webresourcetype,displayname,description,languagecode`,{headers:H})).json();
console.log('to copy:', list.value.map(w=>w.name));
for(const w of list.value){
  const newName=w.name.replace(/^cc_vip\./, 'vip_vip.');
  // does it already exist?
  const ex=await (await fetch(`${ORG}/api/data/v9.2/webresourceset?$filter=name eq '${newName}'&$select=webresourceid,versionnumber`,{headers:H})).json();
  const body={
    name:newName,
    displayname:w.displayname||newName,
    webresourcetype:w.webresourcetype,
    content:w.content,
    languagecode:w.languagecode||1033
  };
  if(ex.value && ex.value.length){
    const id=ex.value[0].webresourceid;
    const r=await fetch(`${ORG}/api/data/v9.2/webresourceset(${id})`,{method:'PATCH',headers:H,body:JSON.stringify({content:w.content})});
    console.log('updated existing', newName, r.status);
  } else {
    const r=await fetch(`${ORG}/api/data/v9.2/webresourceset`,{method:'POST',headers:H,body:JSON.stringify(body)});
    console.log('created', newName, r.status);
    if(!r.ok) console.log(await r.text());
  }
}
const pub=await fetch(`${ORG}/api/data/v9.2/PublishAllXml`,{method:'POST',headers:H});
console.log('publishall:', pub.status);
