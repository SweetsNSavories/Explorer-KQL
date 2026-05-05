// Creates a multiline column on systemuser, a new main form named
// "Kusto Explorer" with the vip.KustoExplorer PCF control bound to it,
// and publishes customizations.

import { PublicClientApplication, LogLevel } from "@azure/msal-node";
import fetch from "node-fetch";
import { v4 as uuid } from "uuid";
import fs from "fs";

const ORG_URL  = process.env.DV_URL  || "https://orgd90897e4.crm.dynamics.com";
const TENANT   = process.env.DV_TENANT || "1557f771-4c8e-4dbd-8b80-dd00a88e833e";
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const CACHE_FILE = ".token-cache.json";

const COL_LOGICAL = "vip_kqlquery";
const COL_SCHEMA  = "vip_KqlQuery";
const COL_DISPLAY = "KQL Query";
const FORM_NAME   = "Kusto Explorer";
const ENTITY      = "systemuser";
const PCF_NAME    = "vip_vip.KustoExplorer";

async function getToken() {
    const cachePlugin = {
        beforeCacheAccess: async (ctx) => {
            if (fs.existsSync(CACHE_FILE)) {
                ctx.tokenCache.deserialize(fs.readFileSync(CACHE_FILE, "utf8"));
            }
        },
        afterCacheAccess: async (ctx) => {
            if (ctx.cacheHasChanged) {
                fs.writeFileSync(CACHE_FILE, ctx.tokenCache.serialize());
            }
        },
    };
    const pca = new PublicClientApplication({
        auth: {
            clientId: CLIENT_ID,
            authority: `https://login.microsoftonline.com/${TENANT}`,
        },
        cache: { cachePlugin },
        system: { loggerOptions: { logLevel: LogLevel.Error, piiLoggingEnabled: false } },
    });
    const scopes = [`${ORG_URL}/.default`];
    // Try silent first.
    const accounts = await pca.getTokenCache().getAllAccounts();
    if (accounts.length) {
        try {
            const r = await pca.acquireTokenSilent({ account: accounts[0], scopes });
            return r.accessToken;
        } catch { /* fall through to device code */ }
    }
    const result = await pca.acquireTokenByDeviceCode({
        scopes,
        deviceCodeCallback: (resp) => {
            console.log("\n>>> " + resp.message + "\n");
        },
    });
    return result.accessToken;
}

async function api(method, path, token, body, extraHeaders = {}) {
    const url = `${ORG_URL}/api/data/v9.2/${path}`;
    const headers = {
        "Authorization": `Bearer ${token}`,
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
        ...extraHeaders,
    };
    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`${method} ${path} failed (${res.status}): ${text}`);
    }
    return text ? (text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : text) : null;
}

async function ensureColumn(token) {
    try {
        const existing = await api(
            "GET",
            `EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${COL_LOGICAL}')`,
            token,
        );
        console.log(`Column ${COL_LOGICAL} already exists.`);
        return existing.MetadataId;
    } catch (e) {
        if (!String(e.message).includes("404")) throw e;
    }
    console.log(`Creating column ${COL_LOGICAL}...`);
    const body = {
        "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
        "AttributeType": "Memo",
        "AttributeTypeName": { "Value": "MemoType" },
        "Format": "TextArea",
        "MaxLength": 100000,
        "ImeMode": "Disabled",
        "SchemaName": COL_SCHEMA,
        "RequiredLevel": { "Value": "None" },
        "DisplayName": { "LocalizedLabels": [{ "Label": COL_DISPLAY, "LanguageCode": 1033 }] },
        "Description":  { "LocalizedLabels": [{ "Label": "KQL query for Kusto Explorer", "LanguageCode": 1033 }] },
    };
    const res = await fetch(
        `${ORG_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
                "Accept": "application/json",
                "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify(body),
        },
    );
    if (!res.ok) {
        throw new Error(`Create column failed (${res.status}): ${await res.text()}`);
    }
    const loc = res.headers.get("OData-EntityId") || "";
    const m = /\(([0-9a-f-]+)\)/i.exec(loc);
    return m ? m[1] : null;
}

function buildFormXml(formGuid, sectionGuid, cellGuid) {
    const controlUniqueId = `{${uuid()}}`;
    return `<form>
  <tabs>
    <tab name="general" id="{${uuid()}}" IsUserDefined="0" verticallayout="true" expanded="true" showlabel="false">
      <labels><label description="Kusto Explorer" languagecode="1033" /></labels>
      <columns>
        <column width="100%">
          <sections>
            <section name="kusto_section" showlabel="false" showbar="false" id="{${sectionGuid}}" IsUserDefined="0" layout="varwidth" columns="1" labelwidth="115" celllabelalignment="Left" celllabelposition="Left">
              <labels><label description="Kusto" languagecode="1033" /></labels>
              <rows>
                <row>
                  <cell id="{${cellGuid}}" showlabel="false" rowspan="20" colspan="1" auto="false">
                    <labels><label description="${COL_DISPLAY}" languagecode="1033" /></labels>
                    <control id="${COL_LOGICAL}" classid="{E0DECE4B-6FC8-4A8F-A065-082708572369}" datafieldname="${COL_LOGICAL}" disabled="false" uniqueid="${controlUniqueId}" />
                  </cell>
                </row>
              </rows>
            </section>
          </sections>
        </column>
      </columns>
    </tab>
  </tabs>
  <header id="{${uuid()}}" celllabelalignment="Left" celllabelposition="Left" columns="4" labelwidth="115">
    <rows>
      <row />
      <row />
    </rows>
  </header>
  <footer id="{${uuid()}}" celllabelalignment="Left" celllabelposition="Left" columns="4" labelwidth="115">
    <rows><row /></rows>
  </footer>
  <controlDescriptions>
    <controlDescription forControl="${controlUniqueId}">
      <customControl name="${PCF_NAME}" formFactor="0">
        <parameters>
          <query>
            <binding>${COL_LOGICAL}</binding>
          </query>
          <customApiName static="true" type="SingleLine.Text">vip_azuremonitorquery</customApiName>
        </parameters>
      </customControl>
      <customControl name="${PCF_NAME}" formFactor="2">
        <parameters>
          <query>
            <binding>${COL_LOGICAL}</binding>
          </query>
          <customApiName static="true" type="SingleLine.Text">vip_azuremonitorquery</customApiName>
        </parameters>
      </customControl>
    </controlDescription>
  </controlDescriptions>
</form>`;
}

async function ensureForm(token) {
    // Check whether a form with this name already exists.
    const existing = await api(
        "GET",
        `systemforms?$select=formid,name,type&$filter=objecttypecode eq '${ENTITY}' and name eq '${FORM_NAME}' and type eq 2`,
        token,
    );
    if (existing.value && existing.value.length) {
        console.log(`Form '${FORM_NAME}' already exists (id=${existing.value[0].formid}). Updating FormXml...`);
        const formId = existing.value[0].formid;
        const xml = buildFormXml(formId, uuid(), uuid());
        await api("PATCH", `systemforms(${formId})`, token, {
            formxml: xml,
            description: "Generated by KustoExplorer deploy script",
        });
        return formId;
    }
    const formId = uuid();
    const xml = buildFormXml(formId, uuid(), uuid());
    console.log(`Creating new form '${FORM_NAME}' on ${ENTITY}...`);
    const body = {
        formid: formId,
        name: FORM_NAME,
        description: "KQL editor form using vip.KustoExplorer",
        objecttypecode: ENTITY,
        type: 2,            // Main form
        formactivationstate: 1, // Active
        formpresentation: 1, // Updated/refresh form
        formxml: xml,
    };
    await api("POST", "systemforms", token, body);
    return formId;
}

async function publish(token) {
    console.log("Publishing customizations...");
    const xml = `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>`;
    await api("POST", "PublishXml", token, { ParameterXml: xml });
}

(async () => {
    const token = await getToken();
    await ensureColumn(token);
    // brief delay for metadata to settle
    await new Promise(r => setTimeout(r, 4000));
    const formId = await ensureForm(token);
    await publish(token);
    console.log(`\nDone. Form id: ${formId}`);
    console.log(`Open: ${ORG_URL}/main.aspx?etn=${ENTITY}&pagetype=entityrecord&formid=${formId}`);
})().catch((e) => {
    console.error("FAILED:", e.message);
    process.exit(1);
});

