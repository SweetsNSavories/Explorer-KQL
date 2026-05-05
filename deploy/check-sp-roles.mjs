import fs from "fs";
import fetch from "node-fetch";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";

const TENANT = "1557f771-4c8e-4dbd-8b80-dd00a88e833e";
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const SP_OID = "4af0f427-bce6-45e3-b853-b4b1e3eaa8b3";
const SCOPE = "/subscriptions/0a537d41-5022-4045-b883-9f81a4472cc6/resourceGroups/pravth-resource-group/providers/microsoft.insights/components/dynamicsofficewebhook";

const cache = '.arm-token-cache.json';
const cachePlugin = {
    beforeCacheAccess: async (c) => { if (fs.existsSync(cache)) c.tokenCache.deserialize(fs.readFileSync(cache,'utf8')); },
    afterCacheAccess: async (c) => { if (c.cacheHasChanged) fs.writeFileSync(cache, c.tokenCache.serialize()); },
};
const pca = new PublicClientApplication({ auth:{clientId:CLIENT_ID, authority:`https://login.microsoftonline.com/${TENANT}`}, cache:{cachePlugin}, system:{loggerOptions:{logLevel:LogLevel.Error}} });
const acc = (await pca.getTokenCache().getAllAccounts())[0];
const tok = (await pca.acquireTokenSilent({ account: acc, scopes:['https://management.azure.com/.default'] })).accessToken;
const H = { Authorization:'Bearer '+tok };

// list assignments on the resource for this SP
const url = `https://management.azure.com${SCOPE}/providers/Microsoft.Authorization/roleAssignments?$filter=principalId eq '${SP_OID}'&api-version=2022-04-01`;
const r = await fetch(url, { headers: H }).then(r=>r.json());
console.log(JSON.stringify(r, null, 2));

// Now resolve role definition names
for (const a of (r.value||[])) {
    const rdId = a.properties.roleDefinitionId;
    const rd = await fetch(`https://management.azure.com${rdId}?api-version=2022-04-01`, { headers: H }).then(r=>r.json());
    console.log('  -> role:', rd.properties?.roleName, 'scope:', a.properties.scope);
}
