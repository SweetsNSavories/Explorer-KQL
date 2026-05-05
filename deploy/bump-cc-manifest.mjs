// Bump customcontrol's manifest version to force cache invalidation.
import fs from "fs";
import fetch from "node-fetch";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";
const TENANT="1557f771-4c8e-4dbd-8b80-dd00a88e833e", CLIENT_ID="51f81489-12ee-4a9e-aaae-a2591f45987d", ORG="https://orgd90897e4.crm.dynamics.com";
const cachePlugin = { beforeCacheAccess: async(c)=>{ if(fs.existsSync('.token-cache.json')) c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8')); }, afterCacheAccess: async(c)=>{ if(c.cacheHasChanged) fs.writeFileSync('.token-cache.json', c.tokenCache.serialize()); } };
const pca = new PublicClientApplication({ auth:{clientId:CLIENT_ID, authority:`https://login.microsoftonline.com/${TENANT}`}, cache:{cachePlugin}, system:{loggerOptions:{logLevel:LogLevel.Error}} });
const acc = (await pca.getTokenCache().getAllAccounts())[0];
const tok = (await pca.acquireTokenSilent({ account: acc, scopes:[`${ORG}/.default`] })).accessToken;
const H = { Authorization:'Bearer '+tok, 'Content-Type':'application/json', 'OData-MaxVersion':'4.0','OData-Version':'4.0', Accept:'application/json' };
const id = 'd0ec2473-8fcb-4153-bed6-c73be0d0a2ed';

const cur = await fetch(`${ORG}/api/data/v9.2/customcontrols(${id})`, { headers: H }).then(r=>r.json());
console.log('Current manifest version attr:', cur.manifest.match(/<control[^>]+version="([^"]+)"/)?.[1]);
console.log('Current customcontrol.version:', cur.version, 'versionnumber:', cur.versionnumber);

const m = cur.manifest.match(/version="(\d+)\.(\d+)\.(\d+)"/);
const newV = `${m[1]}.${parseInt(m[2],10)+1}.0`;
const newManifest = cur.manifest.replace(/(<control[^>]+version=")[^"]+(")/, `$1${newV}$2`);
console.log('New manifest version attr:', newV);

const p = await fetch(`${ORG}/api/data/v9.2/customcontrols(${id})`, { method:'PATCH', headers:H, body: JSON.stringify({ manifest: newManifest }) });
console.log('PATCH manifest:', p.status, (await p.text())||'');

const after = await fetch(`${ORG}/api/data/v9.2/customcontrols(${id})`, { headers: H }).then(r=>r.json());
console.log('After: version=', after.version, 'versionnumber=', after.versionnumber);
console.log('After manifest version attr:', after.manifest.match(/<control[^>]+version="([^"]+)"/)?.[1]);

// Publish
const xml = `<importexportxml><customcontrols><customcontrol>${id}</customcontrol></customcontrols></importexportxml>`;
const pub = await fetch(`${ORG}/api/data/v9.2/PublishXml`, { method:'POST', headers:H, body: JSON.stringify({ ParameterXml: xml }) });
console.log('publish:', pub.status);
