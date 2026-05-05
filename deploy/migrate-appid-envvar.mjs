// Migrate vip_AppInsightsAppId env var value from plain string to JSON array.
import fetch from "node-fetch";
import fs from "fs";

const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const SCHEMA = "vip_AppInsightsAppId";

async function api(method, p, body) {
    const r = await fetch(ORG + '/api/data/v9.2/' + p, {
        method,
        headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion':'4.0','OData-Version':'4.0' },
        body: body ? JSON.stringify(body) : undefined
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${t}`);
    return t ? JSON.parse(t) : null;
}

const def = await api('GET', `environmentvariabledefinitions?$filter=schemaname eq '${SCHEMA}'&$select=environmentvariabledefinitionid,defaultvalue`);
if (!def.value.length) throw new Error('def not found');
const defId = def.value[0].environmentvariabledefinitionid;
const oldDefault = def.value[0].defaultvalue;
const vals = await api('GET', `environmentvariablevalues?$filter=_environmentvariabledefinitionid_value eq ${defId}&$select=environmentvariablevalueid,value`);
const valRow = vals.value[0];
const oldVal = valRow ? valRow.value : oldDefault;
console.log('Old value:', oldVal);

let parsed;
try { parsed = JSON.parse(oldVal); } catch { parsed = null; }
let newJson;
if (Array.isArray(parsed)) {
    console.log('Already JSON array. No change needed.');
    process.exit(0);
} else {
    const appId = (oldVal || "").trim();
    newJson = JSON.stringify([{ name: "default", appId: appId }]);
}
console.log('New value:', newJson);

if (valRow) {
    await fetch(ORG + `/api/data/v9.2/environmentvariablevalues(${valRow.environmentvariablevalueid})`, {
        method:'PATCH', headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'}, body: JSON.stringify({ value: newJson })
    }).then(async r => { if (!r.ok) throw new Error('patch val: '+r.status+' '+await r.text()); console.log('Patched value row.'); });
} else {
    // create
    await api('POST', 'environmentvariablevalues', {
        value: newJson,
        "EnvironmentVariableDefinitionId@odata.bind": `/environmentvariabledefinitions(${defId})`
    });
    console.log('Created value row.');
}
