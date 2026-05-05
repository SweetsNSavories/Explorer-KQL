// Add Kusto Explorer artifacts (role + systemform + js webresource) into the
// KustoExplorerSolution so they ship together when the solution is exported.
import fetch from "node-fetch";
import fs from "fs";

const tok = Object.values(JSON.parse(fs.readFileSync('.token-cache.json','utf8'))['AccessToken'])[0].secret;
const ORG = "https://orgd90897e4.crm.dynamics.com";
const SOLUTION_UNIQUE_NAME = "KustoExplorerSolution";

// Component types: https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/solutioncomponent
const COMP_TYPE = {
    Entity: 1,
    SystemForm: 60,
    SecurityRole: 20,
    WebResource: 61,
    EnvironmentVariableDefinition: 380,
    PluginAssembly: 91,
    SDKMessageProcessingStep: 92,
    CustomAPI: 10027,
    CustomAPIRequestParameter: 10028,
    CustomAPIResponseProperty: 10029,
};
// IncludedComponentSettingsValues: 0 = Subcomponents (default), 1 = RootComponentBehavior
// rootComponentBehavior: 0 = Include subcomponents, 1 = Do not include subcomponents, 2 = Include as shell only

const components = [
    { id: "08d61102-7247-f111-bec6-7c1e5267f8c3", type: COMP_TYPE.SecurityRole, name: "PPAC Kusto Reader role" },
    { id: "69c22e59-1888-4d06-9afb-4d301a3a5d2f", type: COMP_TYPE.SystemForm, name: "Kusto Explorer systemform" },
    { id: "d174d07e-6d47-f111-bec6-7c1e5267f8c3", type: COMP_TYPE.WebResource, name: "vip_/js/kustoexplorer_form.js" },
    { id: "153cad4e-6585-f011-b4cb-7c1e5217c8fa", type: COMP_TYPE.CustomAPI, name: "vip_conversationdiagnostics" },
    { id: "9b7bc61e-6e47-f111-bec7-6045bdec0f2e", type: COMP_TYPE.CustomAPIRequestParameter, name: "vip_AppId" },
    { id: "9c4bc720-6e47-f111-bec6-7c1e5267f8c3", type: COMP_TYPE.CustomAPIRequestParameter, name: "vip_Operation" },
    { id: "666fc9c1-3247-f111-bec6-6045bdd91664", type: COMP_TYPE.PluginAssembly, name: "vip.ConversationDiagnosticsPreOp assembly" },
    // env var definitions (looked up below)
];

// look up env var definition ids
async function api(method, p, body) {
    const r = await fetch(ORG + '/api/data/v9.2/' + p, {
        method,
        headers: { Authorization:'Bearer '+tok, Accept:'application/json', 'Content-Type':'application/json', 'OData-MaxVersion':'4.0','OData-Version':'4.0' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${t}`);
    return t ? JSON.parse(t) : null;
}

const envvars = ["vip_AppInsightsAppId","vip_AppInsightsTenantId","vip_AppInsightsClientId","vip_AppInsightsClientSecret"];
for (const sn of envvars) {
    const j = await api('GET', `environmentvariabledefinitions?$select=environmentvariabledefinitionid&$filter=schemaname eq '${sn}'`);
    if (j.value.length) components.push({ id: j.value[0].environmentvariabledefinitionid, type: COMP_TYPE.EnvironmentVariableDefinition, name: sn });
}

for (const c of components) {
    const r = await fetch(ORG + `/api/data/v9.2/AddSolutionComponent`, {
        method: 'POST',
        headers: { Authorization: 'Bearer '+tok, 'Content-Type':'application/json', 'OData-MaxVersion':'4.0','OData-Version':'4.0' },
        body: JSON.stringify({
            ComponentId: c.id,
            ComponentType: c.type,
            SolutionUniqueName: SOLUTION_UNIQUE_NAME,
            AddRequiredComponents: false,
            DoNotIncludeSubcomponents: false,
        }),
    });
    const txt = await r.text();
    console.log(`${r.status}\t${c.name}\t${txt.slice(0,200)}`);
}
