// Grant Monitoring Reader role to the AI SP on the dynamicsofficewebhook AI resource.
import fs from "fs";
import fetch from "node-fetch";
import crypto from "crypto";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";

const TENANT = "1557f771-4c8e-4dbd-8b80-dd00a88e833e";
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const SP_APP_ID = "d84afeca-cc94-4e87-aec0-b1c70d799eb8";
const SCOPE = "/subscriptions/0a537d41-5022-4045-b883-9f81a4472cc6/resourceGroups/pravth-resource-group/providers/microsoft.insights/components/dynamicsofficewebhook";
const SUB = "0a537d41-5022-4045-b883-9f81a4472cc6";
// Monitoring Reader built-in role
const ROLE_DEF_ID = `/subscriptions/${SUB}/providers/Microsoft.Authorization/roleDefinitions/43d0d8ad-25c7-4714-9337-8ba259a9fe05`;

function makeCache(path) {
    return {
        beforeCacheAccess: async (c) => { if (fs.existsSync(path)) c.tokenCache.deserialize(fs.readFileSync(path,'utf8')); },
        afterCacheAccess: async (c) => { if (c.cacheHasChanged) fs.writeFileSync(path, c.tokenCache.serialize()); },
    };
}

async function getToken(cacheFile, scopes) {
    const pca = new PublicClientApplication({ auth:{clientId:CLIENT_ID, authority:`https://login.microsoftonline.com/${TENANT}`}, cache:{cachePlugin: makeCache(cacheFile)}, system:{loggerOptions:{logLevel:LogLevel.Error}} });
    const acc = (await pca.getTokenCache().getAllAccounts())[0];
    if (acc) { try { return (await pca.acquireTokenSilent({ account: acc, scopes })).accessToken; } catch {} }
    const r = await pca.acquireTokenByDeviceCode({ scopes, deviceCodeCallback: (d) => console.log("\n>>> "+d.message+"\n") });
    return r.accessToken;
}

const armTok = await getToken('.arm-token-cache.json', ['https://management.azure.com/.default']);
const graphTok = await getToken('.graph-token-cache.json', ['https://graph.microsoft.com/.default']);

// Resolve SP objectId
const spResp = await fetch(`https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${SP_APP_ID}'&$select=id,displayName`,
    { headers:{ Authorization:'Bearer '+graphTok } }).then(r=>r.json());
if (!spResp.value || !spResp.value.length) throw new Error('SP not found: ' + JSON.stringify(spResp));
const spObjectId = spResp.value[0].id;
console.log('SP:', spResp.value[0].displayName, 'objectId:', spObjectId);

const assignmentId = crypto.randomUUID();
const url = `https://management.azure.com${SCOPE}/providers/Microsoft.Authorization/roleAssignments/${assignmentId}?api-version=2022-04-01`;
const body = { properties: { roleDefinitionId: ROLE_DEF_ID, principalId: spObjectId, principalType: "ServicePrincipal" } };

const r = await fetch(url, { method:'PUT', headers:{ Authorization:'Bearer '+armTok, 'Content-Type':'application/json' }, body: JSON.stringify(body) });
const txt = await r.text();
console.log('roleAssignment PUT:', r.status, txt);
