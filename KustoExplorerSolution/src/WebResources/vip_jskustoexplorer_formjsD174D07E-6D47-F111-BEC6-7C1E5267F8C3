"use strict";
var vip = vip || {};
vip.KustoExplorerForm = vip.KustoExplorerForm || {};

vip.KustoExplorerForm.onLoad = function (executionContext) {
    try {
        var formContext = executionContext.getFormContext();
        if (formContext.ui && formContext.ui.headerSection) {
            formContext.ui.headerSection.setBodyVisible(false);
            formContext.ui.headerSection.setCommandBarVisible(false);
            formContext.ui.headerSection.setTabNavigatorVisible(false);
        }
    } catch (err) {
        console.error("vip.KustoExplorerForm.onLoad failed:", err);
    }
};

