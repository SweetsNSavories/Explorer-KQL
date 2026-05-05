import fetch from "node-fetch";
import fs from "fs";
const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const wanted = ["prvReadCustomAPI","prvReadCustomAPIRequestParameter","prvReadCustomAPIResponseProperty","prvReadEnvironmentVariableDefinition","prvReadEnvironmentVariableValue","prvReadPluginType","prvReadPluginAssembly","prvReadSdkMessage","prvReadSdkMessageProcessingStep","prvReadWebResource","prvReadCustomization"];
const filter = wanted.map(n => `name eq '${n}'`).join(' or ');
const r = await fetch(ORG + '/api/data/v9.2/privileges?$select=privilegeid,name&$filter=' + encodeURIComponent(filter), {headers:{Authorization:'Bearer '+tok}});
const j = await r.json();
const got = new Set(j.value.map(v => v.name));
console.log('Missing:', wanted.filter(n => !got.has(n)));
// search variants
const r2 = await fetch(ORG + `/api/data/v9.2/privileges?$select=name&$filter=startswith(name,'prvReadCustom') or startswith(name,'prvReadEnv') or startswith(name,'prvReadPlugin') or startswith(name,'prvReadSdk') or startswith(name,'prvReadWeb')`, {headers:{Authorization:'Bearer '+tok}});
const j2 = await r2.json();
console.log(j2.value.map(v=>v.name).sort());
