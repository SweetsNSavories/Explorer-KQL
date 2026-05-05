import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { App } from "./App";
import { CustomApiKqlExecutor } from "./CustomApiExecutor";

const DEFAULT_CUSTOM_API = "vip_azuremonitorquery";

export class KustoExplorer
    implements ComponentFramework.ReactControl<IInputs, IOutputs>
{
    private notifyOutputChanged: () => void;
    private context: ComponentFramework.Context<IInputs>;
    private query = "";
    private executor?: CustomApiKqlExecutor;
    private executorApiName = "";
    private initialQuery = "";
    private onPrimaryQueryChange?: (q: string) => void;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
    ): void {
        this.context = context;
        this.notifyOutputChanged = notifyOutputChanged;
        this.query = context.parameters.query?.raw ?? "";
        this.initialQuery = this.query;
        this.onPrimaryQueryChange = (q: string) => {
            if (q !== this.query) {
                this.query = q;
                this.notifyOutputChanged();
            }
        };
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        this.context = context;
        const apiName = context.parameters.customApiName?.raw ?? DEFAULT_CUSTOM_API;
        // Reuse the executor across updateView ticks so child effects don't re-fire.
        if (!this.executor || this.executorApiName !== apiName) {
            this.executor = new CustomApiKqlExecutor(context.webAPI, apiName);
            this.executorApiName = apiName;
        }

        return React.createElement(App, {
            initialQuery: this.initialQuery,
            executor: this.executor,
            onPrimaryQueryChange: this.onPrimaryQueryChange!,
        });
    }

    public getOutputs(): IOutputs {
        return { query: this.query };
    }

    public destroy(): void { /* nothing */ }
}
