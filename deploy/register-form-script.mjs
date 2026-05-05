// Upload JS web resource, attach as form library, register OnLoad event, publish.
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json', 'utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const FORM_ID = "69c22e59-1888-4d06-9afb-4d301a3a5d2f";
const WR_NAME = "vip_/js/kustoexplorer_form.js";
const WR_DISPLAY = "vip Kusto Explorer Form Script";

const jsPath = path.resolve("./webresources/vip_kustoexplorer_form.js");
const content = fs.readFileSync(jsPath);
const b64 = content.toString("base64");

async function api(method, p, body, prefer) {
    const headers = {
        Authorization: 'Bearer ' + tok,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
    };
    if (prefer) headers.Prefer = prefer;
    const r = await fetch(ORG + '/api/data/v9.2/' + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text();
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${t}`);
    return t ? JSON.parse(t) : null;
}

// 1. Find or create web resource
const existing = await api('GET', `webresourceset?$filter=name eq '${WR_NAME}'&$select=webresourceid`);
let webresourceid;
if (existing.value.length) {
    webresourceid = existing.value[0].webresourceid;
    console.log('Updating existing web resource', webresourceid);
    await api('PATCH', `webresourceset(${webresourceid})`, { content: b64, displayname: WR_DISPLAY });
} else {
    console.log('Creating web resource');
    const created = await api('POST', 'webresourceset', {
        name: WR_NAME,
        displayname: WR_DISPLAY,
        webresourcetype: 3, // JScript
        content: b64
    }, 'return=representation');
    webresourceid = created.webresourceid;
    console.log('Created', webresourceid);
}

// 2. Publish web resource
await fetch(ORG + '/api/data/v9.2/PublishXml', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ParameterXml: `<importexportxml><webresources><webresource>${webresourceid}</webresource></webresources></importexportxml>` })
}).then(r => console.log('Publish webresource:', r.status));

// 3. Patch formxml: add <formLibraries><Library/></formLibraries> and <events><event><Handlers>...</Handlers></event></events>
const form = await api('GET', `systemforms(${FORM_ID})?$select=formxml`);
let xml = form.formxml;

// Strip any existing formLibraries / events for this script (idempotent)
xml = xml.replace(/<formLibraries>[\s\S]*?<\/formLibraries>/g, '');
xml = xml.replace(/<events>[\s\S]*?<\/events>/g, '');

const libsAndEvents = `
<formLibraries>
  <Library name="${WR_NAME}" libraryUniqueId="{${crypto.randomUUID()}}" />
</formLibraries>
<events>
  <event name="onload" application="false" active="true">
    <Handlers>
      <Handler functionName="vip.KustoExplorerForm.onLoad" libraryName="${WR_NAME}" handlerUniqueId="{${crypto.randomUUID()}}" enabled="true" parameters="" passExecutionContext="true" />
    </Handlers>
  </event>
</events>
`;

// Insert before </form>
xml = xml.replace(/<\/form>\s*$/, libsAndEvents + '</form>');

await fetch(ORG + `/api/data/v9.2/systemforms(${FORM_ID})`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ formxml: xml })
}).then(async r => {
    if (!r.ok) throw new Error('PATCH formxml: ' + r.status + ' ' + await r.text());
    console.log('PATCH formxml ok');
});

// 4. Publish form
await fetch(ORG + '/api/data/v9.2/PublishXml', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ParameterXml: `<importexportxml><systemforms><systemform>${FORM_ID}</systemform></systemforms></importexportxml>` })
}).then(r => console.log('Publish form:', r.status));
