import fs from 'fs';
import fetch from 'node-fetch';
import { PublicClientApplication, LogLevel } from '@azure/msal-node';
const TENANT='1557f771-4c8e-4dbd-8b80-dd00a88e833e', CLIENT_ID='51f81489-12ee-4a9e-aaae-a2591f45987d', ORG='https://orgd90897e4.crm.dynamics.com';
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'))},afterCacheAccess:async(c)=>{if(c.cacheHasChanged)fs.writeFileSync('.token-cache.json',c.tokenCache.serialize())}};
const pca=new PublicClientApplication({auth:{clientId:CLIENT_ID,authority:'https://login.microsoftonline.com/'+TENANT},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const tok=(await pca.acquireTokenSilent({account:acc,scopes:[ORG+'/.default']})).accessToken;
const H={Authorization:'Bearer '+tok};
const sid='60d1fecb-6c27-4757-9bed-70dcda4c5e94';
const r=await fetch(`${ORG}/api/data/v9.2/solutioncomponents?$filter=_solutionid_value eq ${sid}&$select=componenttype,objectid,rootcomponentbehavior&$top=500`,{headers:H});
const j=await r.json();
const types={1:'Entity',2:'Attribute',9:'OptionSet',20:'Role',26:'EntityRel',29:'Workflow',60:'SystemForm',61:'WebResource',66:'CustomControl',91:'PluginAssembly',92:'PluginType',93:'PluginStep',379:'CustomAPI',380:'CustomAPIRequestParam',381:'CustomAPIResponseParam',419:'EnvironmentVariableDef',420:'EnvironmentVariableValue',300:'AppModule',301:'AppModuleComponent'};
const grouped={};
for(const c of (j.value||[])){const k=types[c.componenttype]||('type:'+c.componenttype);(grouped[k]=grouped[k]||[]).push(c.objectid);}
for(const k of Object.keys(grouped).sort()){console.log(k,'=',grouped[k].length);}
console.log('TOTAL',(j.value||[]).length);
