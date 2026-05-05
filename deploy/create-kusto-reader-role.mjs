// Create / update a security role "PPAC Kusto Reader" with the minimum
// privileges needed to open the Kusto Explorer form on systemuser, run the
// vip_conversationdiagnostics Custom API, read the env vars, and read the PCF.
import fetch from "node-fetch";
import fs from "fs";

const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const ROLE_NAME = "PPAC Kusto Reader";

async function api(method, p, body, prefer) {
    const headers = {
        Authorization: 'Bearer ' + tok, Accept: 'application/json',
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    };
    if (prefer) headers.Prefer = prefer;
    const r = await fetch(ORG + '/api/data/v9.2/' + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text();
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${t}`);
    return t ? JSON.parse(t) : null;
}

// 1. Find root business unit
const bus = await api('GET', `businessunits?$select=businessunitid,name&$filter=parentbusinessunitid eq null`);
const rootBuId = bus.value[0].businessunitid;
console.log('Root BU:', rootBuId, bus.value[0].name);

// 2. Find / create role at root BU
const existingRoles = await api('GET', `roles?$select=roleid,name&$filter=name eq '${ROLE_NAME}' and _businessunitid_value eq ${rootBuId}`);
let roleId;
if (existingRoles.value.length) {
    roleId = existingRoles.value[0].roleid;
    console.log('Role exists:', roleId);
} else {
    const created = await api('POST', 'roles', {
        name: ROLE_NAME,
        description: "Read-only access to Kusto Explorer form on systemuser, with execute on vip_conversationdiagnostics.",
        "businessunitid@odata.bind": `/businessunits(${rootBuId})`,
    }, 'return=representation');
    roleId = created.roleid;
    console.log('Created role:', roleId);
}

// 3. Look up privilege ids by name. Read = 1 (Basic/User), 2 (Local/BU), 4 (Deep/Parent:Child), 8 (Global/Organization).
// We want: prvReadSystemUser, prvReadCustomization (for PCF), prvReadEnvironmentVariableDefinition, prvReadEnvironmentVariableValue,
//          prvReadCustomAPI (so the action is callable). Execute privilege on the message itself.
const PRIV_NAMES = [
    "prvReadSystemUser",
    "prvReadCustomization",
    "prvReadEntity",
    "prvReadOrganization",
    "prvReadCustomAPI",
    "prvReadCustomAPIRequestParameter",
    "prvReadCustomAPIResponseProperty",
    "prvReadEnvironmentVariableDefinition",
    "prvReadEnvironmentVariableValue",
    "prvReadPluginType",
    "prvReadPluginAssembly",
    "prvReadSdkMessage",
    "prvReadSdkMessageProcessingStep",
    "prvReadWebResource",
];
const filter = PRIV_NAMES.map(n => `name eq '${n}'`).join(' or ');
const privs = await api('GET', `privileges?$select=privilegeid,name&$filter=${encodeURIComponent(filter)}`);
const found = new Map(privs.value.map(p => [p.name, p.privilegeid]));
console.log('Found', found.size, 'of', PRIV_NAMES.length, 'privileges');

// 4. Assign each privilege at Global depth using AddPrivilegesRole action
const privPayload = PRIV_NAMES.filter(n => found.has(n)).map(n => ({
    PrivilegeId: found.get(n),
    Depth: "Global"
}));
const r = await fetch(ORG + `/api/data/v9.2/roles(${roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', 'OData-MaxVersion':'4.0','OData-Version':'4.0' },
    body: JSON.stringify({ Privileges: privPayload }),
});
console.log('AddPrivilegesRole:', r.status, await r.text() || '(empty)');

console.log('\nRole id:', roleId);
console.log('Assign to a user via PowerPlatform admin or via:');
console.log(`  POST ${ORG}/api/data/v9.2/systemusers(<userId>)/systemuserroles_association/$ref`);
console.log(`  body: { "@odata.id": "${ORG}/api/data/v9.2/roles(${roleId})" }`);
