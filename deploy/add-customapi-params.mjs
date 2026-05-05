// Add vip_AppId and vip_Operation request parameters to vip_conversationdiagnostics custom API.
import fetch from "node-fetch";
import fs from "fs";

const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json', 'utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const CUSTOMAPIID = "153cad4e-6585-f011-b4cb-7c1e5217c8fa";
const PUB_PREFIX = "vip";

async function api(method, p, body) {
    const r = await fetch(ORG + '/api/data/v9.2/' + p, {
        method,
        headers: {
            Authorization: 'Bearer ' + tok,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
            Prefer: 'return=representation'
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${t}`);
    return t ? JSON.parse(t) : null;
}

const params = [
    { uniqueName: "vip_AppId",     displayName: "App Id",    description: "App Insights app id (overrides default)", type: 10 /* string */ },
    { uniqueName: "vip_Operation", displayName: "Operation", description: "query | apps | savedqueries | schema",     type: 10 },
];

// type values: 0=Boolean, 1=DateTime, 2=Decimal, 3=Entity, 4=EntityCollection, 5=EntityReference, 6=Float, 7=Integer, 8=Money, 9=Picklist, 10=String, 11=StringArray, 12=Guid

// list existing
const ex = await api('GET', `customapirequestparameters?$filter=_customapiid_value eq ${CUSTOMAPIID}&$select=uniquename,name`);
const existing = new Set(ex.value.map(p => p.uniquename));
console.log('Existing inputs:', [...existing]);

for (const p of params) {
    if (existing.has(p.uniqueName)) { console.log('exists:', p.uniqueName); continue; }
    const body = {
        uniquename: p.uniqueName,
        name: p.uniqueName,
        displayname: p.displayName,
        description: p.description,
        isoptional: true,
        logicalentityname: null,
        type: p.type,
        "CustomAPIId@odata.bind": `/customapis(${CUSTOMAPIID})`
    };
    const created = await api('POST', 'customapirequestparameters', body);
    console.log('Created:', p.uniqueName, '->', created.customapirequestparameterid);
}

// Publish
await fetch(ORG + '/api/data/v9.2/PublishAllXml', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: '{}' })
    .then(r => console.log('PublishAllXml:', r.status));
