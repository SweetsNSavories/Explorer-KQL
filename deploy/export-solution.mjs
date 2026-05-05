import fs from 'fs';
import fetch from 'node-fetch';
import { PublicClientApplication, LogLevel } from '@azure/msal-node';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
const TENANT='1557f771-4c8e-4dbd-8b80-dd00a88e833e', CLIENT_ID='51f81489-12ee-4a9e-aaae-a2591f45987d', ORG='https://orgd90897e4.crm.dynamics.com';
const cachePlugin={beforeCacheAccess:async(c)=>{if(fs.existsSync('.token-cache.json'))c.tokenCache.deserialize(fs.readFileSync('.token-cache.json','utf8'))},afterCacheAccess:async(c)=>{if(c.cacheHasChanged)fs.writeFileSync('.token-cache.json',c.tokenCache.serialize())}};
const pca=new PublicClientApplication({auth:{clientId:CLIENT_ID,authority:'https://login.microsoftonline.com/'+TENANT},cache:{cachePlugin},system:{loggerOptions:{logLevel:LogLevel.Error}}});
const acc=(await pca.getTokenCache().getAllAccounts())[0];
const tok=(await pca.acquireTokenSilent({account:acc,scopes:[ORG+'/.default']})).accessToken;
const H={Authorization:'Bearer '+tok,'Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0'};

// 1. Find all vip env var defs
const evs=await (await fetch(`${ORG}/api/data/v9.2/environmentvariabledefinitions?$select=schemaname,environmentvariabledefinitionid,displayname,type&$filter=startswith(schemaname,'vip_AppInsights') or startswith(schemaname,'vip_Tenant') or startswith(schemaname,'vip_Client')`,{headers:H})).json();
console.log('env vars found:'); for(const e of evs.value) console.log(' -', e.schemaname, e.environmentvariabledefinitionid);

// 2. Add to solution
for(const e of evs.value){
  const r=await fetch(`${ORG}/api/data/v9.2/AddSolutionComponent`,{method:'POST',headers:H,body:JSON.stringify({
    ComponentId: e.environmentvariabledefinitionid,
    ComponentType: 380, // EnvironmentVariableDefinition
    SolutionUniqueName: 'KustoExplorerSolution',
    AddRequiredComponents: false,
    DoNotIncludeSubcomponents: false
  })});
  console.log('add', e.schemaname, ':', r.status, await r.text());
}

// 3. Bump version + add publisher details
const pat=await fetch(`${ORG}/api/data/v9.2/solutions(60d1fecb-6c27-4757-9bed-70dcda4c5e94)`,{method:'PATCH',headers:H,body:JSON.stringify({version:'1.0.3.0',description:'Explorer-KQL: in-form Kusto/Application Insights query editor for Dynamics 365.'})});
console.log('bump:', pat.status, await pat.text());

// 4. Export as managed.
//    The Web API ExportSolution action does not honor the
//    ExportEnvironmentVariables flag (only the maker-portal UI does).
//    So we export normally, then strip every environmentvariablevalues.json
//    out of the resulting zip. Definitions stay; values do not. Customers
//    must set values during/after import or the plugin will fail at runtime
//    when it tries to read the secret. That is intentional.
function stripEnvVarValues(zipPath){
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kxp-strip-'));
  try{
    execSync(`tar -xf "${zipPath}" -C "${tmp}"`);
    let removed = 0;
    function walk(dir){
      for(const e of fs.readdirSync(dir,{withFileTypes:true})){
        const p = path.join(dir, e.name);
        if(e.isDirectory()) walk(p);
        else if(e.name === 'environmentvariablevalues.json'){
          fs.unlinkSync(p); removed++;
        }
      }
    }
    walk(tmp);
    fs.rmSync(zipPath);
    // tar -a -cf would honor extension; on Windows tar.exe (bsdtar) writes zip from .zip
    execSync(`tar -a -cf "${zipPath}" -C "${tmp}" .`);
    console.log('  stripped', removed, 'environmentvariablevalues.json file(s) from', path.basename(zipPath));
  } finally {
    fs.rmSync(tmp,{recursive:true,force:true});
  }
}

const exp=await fetch(`${ORG}/api/data/v9.2/ExportSolution`,{method:'POST',headers:H,body:JSON.stringify({SolutionName:'KustoExplorerSolution',Managed:true})});
const ej=await exp.json();
if(!ej.ExportSolutionFile){console.log('export error:', JSON.stringify(ej)); process.exit(1);}
const buf=Buffer.from(ej.ExportSolutionFile,'base64');
const out='../dist/KustoExplorerSolution_1_0_3_managed.zip';
fs.mkdirSync('../dist',{recursive:true});
fs.writeFileSync(out, buf);
console.log('wrote', out, 'bytes:', buf.length);
stripEnvVarValues(out);
console.log('  final size:', fs.statSync(out).size, 'bytes');

// 5. Also unmanaged for source-control / dev import (same strip)
const exp2=await fetch(`${ORG}/api/data/v9.2/ExportSolution`,{method:'POST',headers:H,body:JSON.stringify({SolutionName:'KustoExplorerSolution',Managed:false})});
const ej2=await exp2.json();
if(ej2.ExportSolutionFile){
  const buf2=Buffer.from(ej2.ExportSolutionFile,'base64');
  const out2='../dist/KustoExplorerSolution_1_0_3_unmanaged.zip';
  fs.writeFileSync(out2, buf2);
  console.log('wrote unmanaged bytes:', buf2.length);
  stripEnvVarValues(out2);
  console.log('  final size:', fs.statSync(out2).size, 'bytes');

  // 6. Refresh the unpacked source tree at KustoExplorerSolution/src so the
  //    GitHub repo shows what actually ships (form, role, plugin steps, custom
  //    API, env var definitions, web resources, PCF bundle). Plain extract; we
  //    are not invoking pac solution unpack because the post-strip re-zip is
  //    lowercase and pac wants uppercase SOLUTION.XML.
  const srcDir = '../KustoExplorerSolution/src';
  fs.rmSync(srcDir, { recursive: true, force: true });
  fs.mkdirSync(srcDir, { recursive: true });
  execSync(`tar -xf "${out2}" -C "${srcDir}"`);
  console.log('refreshed source tree at', srcDir);
}
