import {isEqual} from "lodash";
import {omit} from "lodash";
import {isArray} from "lodash";

const WORKSPACE_FORMAT_JSON = "json";
const WORKSPACE_FORMAT_RAW = "raw";
const WORKSPACE_ID_PLACEHOLDER = "scalefast_workspace_id";

export class WorkspaceHelper {
    private static isWorkspaceType(sourceResource: any, targetResource: any): boolean {
        return sourceResource._type === "workspace" && targetResource._type === "workspace";
    }

    private static isEqualResource(sourceResource: any, targetResource: any): boolean {
        if (WorkspaceHelper.isWorkspaceType(sourceResource, targetResource)) {
            console.log("Is workspace");
            return true;
        }

        return isEqual(
            omit(sourceResource, ["created", "modified", "parentId"]),
            omit(targetResource, ["created", "modified", "parentId"])
        )
    }

    static isEqual(sourceWorkspace, targetWorkspace): boolean {
        if (isArray(sourceWorkspace.resources) && isArray(targetWorkspace.resources)) {
            if (sourceWorkspace.resources.length === targetWorkspace.resources.length) {
                for (let i = 0; i<sourceWorkspace.resources.length;i++) {
                    if (!WorkspaceHelper.isEqualResource(sourceWorkspace.resources[i],targetWorkspace.resources[i])) {
                        return false;
                    }
                }
            } else {
                return false;
            }
        } else {
            return false;
        }
        return true;
    }

    static async getCurrentWorkspace(context: any, data: any, format: string = WORKSPACE_FORMAT_JSON): Promise<any> {
        let workspaceData = await context.data.export.insomnia({
            includePrivate: true,
            format: 'json',
            workspace: data.workspace
        });

        if (format === WORKSPACE_FORMAT_JSON) {
            return JSON.parse(workspaceData);
        } else {
            return workspaceData;
        }
    }

    static async fixWorkspace(workspace: string, workspaceId: string): Promise<any>
    {
        workspace = workspace.replace(new RegExp(WORKSPACE_ID_PLACEHOLDER, 'g'), workspaceId);
        return workspace;

    }

    static async prepareWorkspace(context: any, data: any, format: string = WORKSPACE_FORMAT_JSON): Promise<any>
    {
        let workspace = await WorkspaceHelper.getCurrentWorkspace(context, data, WORKSPACE_FORMAT_RAW);
       workspace = workspace.replace(new RegExp(data.workspace._id, 'g'), WORKSPACE_ID_PLACEHOLDER);

        if (format === WORKSPACE_FORMAT_JSON) {
            return JSON.parse(workspace);
        }

        return workspace;
    }

    static async emptyWorkspace(context: any, data: any): Promise<any> {
        let workspace = JSON.parse(
            await context.data.export.insomnia({
                includePrivate: false,
                format: 'json',
                workspace: data.workspace,
            })
        );

        workspace.resources = [];
        data.requests = [];
        data.requestGroups = [];

        context.data.import.raw(JSON.stringify(workspace), {
            workspaceId: data.workspace._id,
            workspaceScope: "collection"
        });

    }
}