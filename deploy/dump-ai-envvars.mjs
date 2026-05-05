import fs from "fs";
import fetch from "node-fetch";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";

const ORG = "https://orgd90897e4.crm.dynamics.com";
const TENANT = "1557f771-4c8e-4dbd-8b80-dd00a88e833e";
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const CACHE = ".token-cache.json";

const cachePlugin = {
    beforeCacheAccess: async (c) => { if (fs.existsSync(CACHE)) c.tokenCache.deserialize(fs.readFileSync(CACHE,'utf8')); },
    afterCacheAccess: async (c) => { if (c.cacheHasChanged) fs.writeFileSync(CACHE, c.tokenCache.serialize()); },
};
const pca = new PublicClientApplication({ auth:{clientId:CLIENT_ID, authority:`https://login.microsoftonline.com/${TENANT}`}, cache:{cachePlugin}, system:{loggerOptions:{logLevel:LogLevel.Error}} });
const acc = (await pca.getTokenCache().getAllAccounts())[0];
const tok = (await pca.acquireTokenSilent({ account: acc, scopes:[`${ORG}/.default`] })).accessToken;

const H = { Authorization: 'Bearer '+tok, Accept:'application/json' };

for (const sn of ['vip_AppInsightsClientId','vip_AppInsightsTenantId','vip_AppInsightsAppId']) {
    const def = await fetch(`${ORG}/api/data/v9.2/environmentvariabledefinitions?$filter=schemaname eq '${sn}'&$select=environmentvariabledefinitionid,defaultvalue`,{headers:H}).then(r=>r.json());
    const defId = def.value[0]?.environmentvariabledefinitionid;
    const dv = def.value[0]?.defaultvalue;
    let curVal = dv;
    if (defId) {
        const v = await fetch(`${ORG}/api/data/v9.2/environmentvariablevalues?$filter=_environmentvariabledefinitionid_value eq ${defId}&$select=value`,{headers:H}).then(r=>r.json());
        if (v.value[0]?.value !== undefined) curVal = v.value[0].value;
    }
    console.log(sn, '=>', curVal);
}
