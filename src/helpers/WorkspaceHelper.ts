import {isEqual} from "lodash";
import {omit} from "lodash";
import {isArray} from "lodash";


export class WorkspaceHelper {
    private static isEqualResource(sourceResource: object, targetResource: object): boolean {
        return isEqual(
            omit(sourceResource, ["created", "modified"]),
            omit(targetResource, ["created", "modified"])
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

}