import * as React from "react";
import { KustoExplorer, KustoExplorerHandle } from "./KustoExplorer";
import { CustomApiKqlExecutor, AppEntry, SavedQuery, SchemaTable } from "./CustomApiExecutor";

interface TabState {
    id: number;
    label: string;
    query: string;
    appId: string;
    showSavedMenu: boolean;
    expandedCats: Record<string, boolean>;
}

export interface IAppProps {
    initialQuery: string;
    executor: CustomApiKqlExecutor;
    onPrimaryQueryChange: (q: string) => void;
}

export const App: React.FC<IAppProps> = (props) => {
    const [apps, setApps] = React.useState<AppEntry[]>([]);
    const [appsError, setAppsError] = React.useState<string | undefined>();
    const [savedQueries, setSavedQueries] = React.useState<SavedQuery[]>([]);
    const [schema, setSchema] = React.useState<SchemaTable[]>([]);
    const [schemaLoading, setSchemaLoading] = React.useState(false);
    const [schemaError, setSchemaError] = React.useState<string | undefined>();
    const [schemaFilter, setSchemaFilter] = React.useState("");
    const [expandedTables, setExpandedTables] = React.useState<Record<string, boolean>>({});
    const [showSidebar, setShowSidebar] = React.useState(true);
    const [showTables, setShowTables] = React.useState(true);
    const [showQueries, setShowQueries] = React.useState(true);

    const [tabs, setTabs] = React.useState<TabState[]>([{ id: 1, label: "Tab 1", query: props.initialQuery ?? "", appId: "", showSavedMenu: false, expandedCats: {} }]);
    const [activeTabId, setActiveTabId] = React.useState<number>(1);
    const nextIdRef = React.useRef(2);
    const tabRefs = React.useRef<Map<number, KustoExplorerHandle | null>>(new Map());

    // Initial load: apps + saved queries
    React.useEffect(() => {
        void (async () => {
            try {
                const a = await props.executor.getApps();
                setApps(a);
                if (a.length) {
                    setTabs(prev => prev.map(t => t.appId ? t : { ...t, appId: a[0].appId }));
                }
            } catch (e) { setAppsError(e instanceof Error ? e.message : String(e)); }
        })();
        void (async () => {
            try { setSavedQueries(await props.executor.getSavedQueries()); } catch { /* non-fatal */ }
        })();
    }, []);

    const activeTab = tabs.find(t => t.id === activeTabId);
    const activeAppId = activeTab?.appId ?? "";

    // Load schema when active tab's app changes
    React.useEffect(() => {
        if (!activeAppId) return;
        let cancelled = false;
        setSchemaLoading(true); setSchemaError(undefined); setSchema([]);
        props.executor.getSchema(activeAppId).then(s => {
            if (cancelled) return;
            s.sort((a, b) => a.name.localeCompare(b.name));
            setSchema(s);
            setSchemaLoading(false);
            return;
        }).catch(e => {
            if (cancelled) return;
            setSchemaError(e instanceof Error ? e.message : String(e));
            setSchemaLoading(false);
        });
        return () => { cancelled = true; };
    }, [activeAppId, props.executor]);

    const addTab = () => {
        const id = nextIdRef.current++;
        const defaultAppId = activeTab?.appId ?? apps[0]?.appId ?? "";
        setTabs(t => [...t, { id, label: `Tab ${id}`, query: "", appId: defaultAppId, showSavedMenu: false, expandedCats: {} }]);
        setActiveTabId(id);
    };

    const closeTab = (id: number) => {
        setTabs(prev => {
            const idx = prev.findIndex(t => t.id === id);
            if (idx < 0) return prev;
            const next = prev.filter(t => t.id !== id);
            if (next.length === 0) {
                const nid = nextIdRef.current++;
                setActiveTabId(nid);
                return [{ id: nid, label: `Tab ${nid}`, query: "", appId: apps[0]?.appId || "", showSavedMenu: false, expandedCats: {} }];
            }
            if (activeTabId === id) {
                const newActive = next[Math.min(idx, next.length - 1)].id;
                setActiveTabId(newActive);
            }
            return next;
        });
    };

    const updateTabQuery = (id: number, q: string) => {
        setTabs(prev => prev.map(t => t.id === id ? { ...t, query: q } : t));
        if (id === tabs[0]?.id) props.onPrimaryQueryChange(q);
    };

    const renameTab = (id: number) => {
        const cur = tabs.find(t => t.id === id);
        if (!cur) return;
        const v = window.prompt("Rename tab:", cur.label);
        if (v) setTabs(prev => prev.map(t => t.id === id ? { ...t, label: v } : t));
    };

    const insertIntoActive = (text: string) => {
        const handle = tabRefs.current.get(activeTabId);
        if (handle) handle.insertAtCursor(text);
    };

    const loadSavedQuery = (sq: SavedQuery) => {
        const handle = tabRefs.current.get(activeTabId);
        // rename current tab to query name and replace its query
        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, label: sq.name, query: sq.kql, showSavedMenu: false } : t));
        if (handle) handle.setQuery(sq.kql);
    };

    const setTabApp = (id: number, appId: string) => {
        setTabs(prev => prev.map(t => t.id === id ? { ...t, appId } : t));
    };

    const savedQueriesForApp = (_appId: string): SavedQuery[] => {
        // Show every saved query from every source. Categories distinguish them.
        return savedQueries;
    };

    const groupByCategory = (qs: SavedQuery[]): { cat: string; items: SavedQuery[] }[] => {
        const order = ["Built-in", "Alerts", "Browsing data", "Performance", "Reports failures", "Other"];
        const map = new Map<string, SavedQuery[]>();
        for (const q of qs) {
            const c = q.category ?? "Other";
            if (!map.has(c)) map.set(c, []);
            map.get(c)!.push(q);
        }
        const cats = Array.from(map.keys()).sort((a, b) => {
            const ia = order.indexOf(a); const ib = order.indexOf(b);
            if (ia >= 0 && ib >= 0) return ia - ib;
            if (ia >= 0) return -1;
            if (ib >= 0) return 1;
            return a.localeCompare(b);
        });
        return cats.map(c => ({ cat: c, items: map.get(c)!.sort((a, b) => a.name.localeCompare(b.name)) }));
    };

    const toggleCat = (tabId: number, cat: string) => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, expandedCats: { ...t.expandedCats, [cat]: !t.expandedCats[cat] } } : t));
    };

    const filteredSchema = React.useMemo(() => {
        if (!schemaFilter.trim()) return schema;
        const q = schemaFilter.trim().toLowerCase();
        return schema.filter(t => t.name.toLowerCase().includes(q) || t.columns.some(c => c.name.toLowerCase().includes(q)));
    }, [schema, schemaFilter]);

    return React.createElement(
        "div", { className: "kxp-root" },
        // Top bar (just a title)
        React.createElement("div", { className: "kxp-topbar" },
            React.createElement("button", {
                className: "kxp-iconbtn",
                title: showSidebar ? "Hide schema" : "Show schema",
                onClick: () => setShowSidebar(s => !s),
            }, showSidebar ? "◧" : "◨"),
            React.createElement("span", { className: "kxp-title" }, "Explorer - KQL"),
            appsError ? React.createElement("span", { className: "kxp-err-inline" }, appsError) : null,
        ),
        // Tab bar
        React.createElement("div", { className: "kxp-tabbar" },
            ...tabs.map(t =>
                React.createElement("div", {
                    key: t.id,
                    className: "kxp-tabchip" + (t.id === activeTabId ? " active" : ""),
                    onClick: () => setActiveTabId(t.id),
                    onDoubleClick: () => renameTab(t.id),
                    title: "Click to switch · double-click to rename",
                },
                    React.createElement("span", { className: "kxp-tabchip-label" }, t.label),
                    React.createElement("span", {
                        className: "kxp-tabchip-close",
                        title: "Close tab",
                        onClick: (e: React.MouseEvent) => { e.stopPropagation(); closeTab(t.id); },
                    }, "×"))
            ),
            React.createElement("button", { className: "kxp-tabchip-add", title: "New tab", onClick: addTab }, "+"),
        ),
        // Body: schema sidebar + tab content
        React.createElement("div", { className: "kxp-body" },
            showSidebar ? React.createElement("div", { className: "kxp-sidebar" },
                React.createElement("div", { className: "kxp-sidebar-head" },
                    React.createElement("select", {
                        className: "kxp-select kxp-app-select",
                        value: activeAppId,
                        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setTabApp(activeTabId, e.target.value),
                        disabled: !apps.length,
                        title: "Application Insights instance (per tab)",
                    }, ...apps.map(a => React.createElement("option", { key: a.appId, value: a.appId }, `${a.name}`))),
                    schemaLoading ? React.createElement("span", { className: "kxp-status-mini" }, "loading...") : null,
                ),
                React.createElement("input", {
                    className: "kxp-schema-filter",
                    placeholder: "Filter tables / columns...",
                    value: schemaFilter,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSchemaFilter(e.target.value),
                }),
                schemaError ? React.createElement("div", { className: "kxp-err-inline" }, schemaError) : null,
                React.createElement("div", { className: "kxp-sidebar-tree" },
                    // Tables root
                    React.createElement("div", {
                        className: "kxp-sidebar-root" + (showTables ? " expanded" : ""),
                        onClick: () => setShowTables(s => !s),
                    },
                        React.createElement("span", { className: "kxp-tri" }, showTables ? "▾" : "▸"),
                        React.createElement("span", { className: "kxp-sidebar-root-name" }, "Tables"),
                        React.createElement("span", { className: "kxp-sidebar-root-cnt" }, `(${filteredSchema.length})`),
                    ),
                    showTables ? React.createElement("div", { className: "kxp-sidebar-rootbody" },
                        ...filteredSchema.map(t => {
                            const expanded = !!expandedTables[t.name] || !!schemaFilter.trim();
                            return React.createElement(React.Fragment, { key: t.name },
                                React.createElement("div", {
                                    className: "kxp-schema-table",
                                    onClick: () => setExpandedTables(s => ({ ...s, [t.name]: !s[t.name] })),
                                    onDoubleClick: () => insertIntoActive(t.name),
                                    title: "Click to expand · double-click to insert",
                                },
                                    React.createElement("span", { className: "kxp-tri" }, expanded ? "▾" : "▸"),
                                    React.createElement("span", { className: "kxp-schema-tname" }, t.name),
                                    React.createElement("span", { className: "kxp-schema-cnt" }, `(${t.columns.length})`),
                                ),
                                expanded ? React.createElement("div", { className: "kxp-schema-cols" },
                                    ...t.columns.map(c =>
                                        React.createElement("div", {
                                            key: c.name,
                                            className: "kxp-schema-col",
                                            onDoubleClick: () => insertIntoActive(c.name),
                                            title: `${c.name} : ${c.type} (double-click to insert)`,
                                        },
                                            React.createElement("span", { className: "kxp-schema-cname" }, c.name),
                                            React.createElement("span", { className: "kxp-schema-ctype" }, c.type),
                                        ))
                                ) : null,
                            );
                        })
                    ) : null,
                    // Queries root
                    (() => {
                        const groups = groupByCategory(savedQueriesForApp(activeAppId));
                        const total = groups.reduce((n, g) => n + g.items.length, 0);
                        return React.createElement(React.Fragment, { key: "_queries" },
                            React.createElement("div", {
                                className: "kxp-sidebar-root" + (showQueries ? " expanded" : ""),
                                onClick: () => setShowQueries(s => !s),
                            },
                                React.createElement("span", { className: "kxp-tri" }, showQueries ? "▾" : "▸"),
                                React.createElement("span", { className: "kxp-sidebar-root-name" }, "Queries"),
                                React.createElement("span", { className: "kxp-sidebar-root-cnt" }, `(${total})`),
                            ),
                            showQueries ? React.createElement("div", { className: "kxp-sidebar-rootbody" },
                                ...groups.map(g => {
                                    const exp = !!activeTab?.expandedCats[g.cat];
                                    return React.createElement(React.Fragment, { key: g.cat },
                                        React.createElement("div", {
                                            className: "kxp-saved-cat" + (exp ? " expanded" : ""),
                                            onClick: () => toggleCat(activeTabId, g.cat),
                                        },
                                            React.createElement("span", { className: "kxp-tri" }, exp ? "▾" : "▸"),
                                            React.createElement("span", { className: "kxp-saved-cat-name" }, g.cat),
                                            React.createElement("span", { className: "kxp-saved-cat-cnt" }, `(${g.items.length})`),
                                        ),
                                        exp ? React.createElement("div", { className: "kxp-saved-cat-items" },
                                            ...g.items.map(sq =>
                                                React.createElement("div", {
                                                    key: (sq.pack ?? sq.app ?? "_") + "|" + sq.name,
                                                    className: "kxp-saved-item",
                                                    title: sq.kql,
                                                    onClick: () => loadSavedQuery(sq),
                                                }, sq.name))
                                        ) : null,
                                    );
                                })
                            ) : null,
                        );
                    })(),
                ),
            ) : null,
            React.createElement("div", { className: "kxp-content" },
                ...tabs.map(t =>
                    React.createElement("div", {
                        key: t.id,
                        className: "kxp-tabpane",
                        style: { display: t.id === activeTabId ? "flex" : "none" },
                    },
                        React.createElement(KustoExplorer, {
                            ref: (h: KustoExplorerHandle | null) => { tabRefs.current.set(t.id, h); },
                            initialQuery: t.query,
                            appId: t.appId,
                            schema,
                            executor: props.executor,
                            onQueryChange: (q: string) => updateTabQuery(t.id, q),
                        })
                    )
                )
            )
        )
    );
};
