// Patch the systemform.formxml to hide the record header card.
// Tries multiple modern-UCI form attributes: headerdensity="2" (FlyoutHeader),
// showImage="false", and removes <header> contents.
import fetch from "node-fetch";
import fs from "fs";

const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const FORM_ID = "69c22e59-1888-4d06-9afb-4d301a3a5d2f";

async function api(method, path, body) {
    const r = await fetch(ORG + '/api/data/v9.2/' + path, {
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
    const txt = await r.text();
    if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${txt}`);
    return txt ? JSON.parse(txt) : null;
}

const form = await api('GET', `systemforms(${FORM_ID})?$select=formxml,name`);
let xml = form.formxml;
console.log("Before <form ...>:", xml.match(/<form[^>]*>/)?.[0]);

// Force attributes on root <form ...>
xml = xml.replace(/<form\b[^>]*>/, m => {
    let inner = m.slice(5, -1); // strip "<form" and ">"
    // remove existing
    inner = inner.replace(/\s+headerdensity="[^"]*"/i, '')
                 .replace(/\s+showImage="[^"]*"/i, '')
                 .replace(/\s+showImageInForm="[^"]*"/i, '');
    return `<form${inner} headerdensity="FlyoutHeader" showImage="false" showImageInForm="false">`;
});

// Also blank out the <header> element's children
xml = xml.replace(/<header\b([^>]*)>[\s\S]*?<\/header>/i, '<header$1></header>');

console.log("After  <form ...>:", xml.match(/<form[^>]*>/)?.[0]);

await fetch(ORG + `/api/data/v9.2/systemforms(${FORM_ID})`, {
    method: 'PATCH',
    headers: {
        Authorization: 'Bearer ' + tok,
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
    },
    body: JSON.stringify({ formxml: xml })
}).then(async r => {
    if (!r.ok) throw new Error(`PATCH formxml -> ${r.status}: ${await r.text()}`);
    console.log('PATCH ok');
});

// Publish
const pubXml = `<importexportxml><systemforms><systemform>${FORM_ID}</systemform></systemforms></importexportxml>`;
const pub = await fetch(ORG + '/api/data/v9.2/PublishXml', {
    method: 'POST',
    headers: {
        Authorization: 'Bearer ' + tok,
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
    },
    body: JSON.stringify({ ParameterXml: pubXml })
});
console.log('PublishXml:', pub.status);
