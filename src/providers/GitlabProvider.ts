import { Gitlab } from '@gitbeaker/node';
import { Base64 } from 'js-base64';
import { GitProvider } from "../interfaces/GitProvider";

export class GitlabProvider implements GitProvider{
    private client: any;
    constructor(private config) {
        this.client = new Gitlab({
            token: this.config.token,
            host: this.config.baseUrl
        })
    }

    async branchExists(branchName: string = null): Promise<boolean> {
        try {
            if (branchName === null) {
                branchName = await this.getCurrentUser() + "_collection_updates";
            }

            const branches = await this.client.Branches.all(this.config.projectId);
            for (const branch of branches) {
                console.log(branch);
                if (branch.name === branchName) {
                    return true;
                }
            }

            return false;

        } catch (e) {
            throw e;
        }

    }

    async getBranch(branchName: string = null): Promise<any> {
        try {
            if (branchName === null) {
                branchName = await this.getCurrentUser() + "_collection_updates";
            }

            return await this.client.Branches.show(this.config.projectId, branchName);

        } catch (e) {
            return null;
        }
    }

    async fetchBranches(): Promise<string[]> {
        try {
            const branches = await this.client.Branches.all(this.config.projectId);
            return branches.map((o) => o.name);
        } catch (e) {
            console.error(e);
            throw 'Fetching the projects branches via GitLab API failed.'
        }
    }

    async fetchTags(): Promise<string[]> {
        try {
            const tags = await this.client.Tags.all(this.config.projectId);
            return tags.map((o) => o.name);
        } catch (e) {
            console.error(e);
            throw 'Fetching the projects tags via GitLab API failed.'
        }
    }

    async fetchLastTag(): Promise<any> {
        try {
            const tags = await this.client.Tags.all(this.config.projectId);
            return tags.shift();

        } catch (e) {
            console.error(e);
            throw 'Fetching the projects tags via GitLab API failed.'
        }
    }

    async pullWorkspace(ref: string = null): Promise<string> {
        try {
            if (ref === null) {
                const userBranch = await this.getCurrentUser() + "_collection_updates";
                ref = await this.branchExists() ? userBranch : "master";
            }
            const workspace = await this.client.RepositoryFiles.show(this.config.projectId, this.config.configFileName, ref);
            const json = Base64.decode(workspace.content);
            return JSON.parse(json);
        } catch (e) {
            console.error(e);
            throw 'Fetching the workspace via GitLab API failed.'
        }
    }

    async pushWorkspace(content, messageCommit): Promise<string> | null {
        try {
            const branchName = await this.createRemoteUserBranch();
            const commit = await this.client.Commits.create(
                this.config.projectId,
                branchName,
                messageCommit,
                [
                    {
                       action: "update",
                       filePath: this.config.configFileName,
                       content: content
                    }
                ]
            );
            return commit.shortId;
        } catch (e) {
            await this.initRemoteWorkspaceFile();
            await this.pushWorkspace(content, messageCommit);
        }
    }

    async createMergeRequest(mergeRequestTitle): Promise<number> | null {
        try {
            if (await this.branchExists()) {
                const sourceBranch = await this.getCurrentUser() + "_collection_updates";
                const mr = await this.client.MergeRequests.create(
                    this.config.projectId,
                    sourceBranch,
                    "master",
                    mergeRequestTitle,
                    {
                        removeSourceBranch: true,
                        squash: true
                    }
                );

                return (mr.iid);
            }

            return null;
        } catch (e) {
            console.error(e);
            throw 'Creating merge request via GitlabProvider API failed.'
        }
    }

    async getCurrentMergeRequest(): Promise<any> | null {
        try {
            const branchName = await this.getCurrentUser() + "_collection_updates";
            const mergeRequests = await this.client.MergeRequests.all({
                projectId: this.config.projectId,
                state: 'opened',
                sourceBranch: branchName
            });

            if (mergeRequests[0]) {
                return mergeRequests[0];
            }

            return null;

        } catch (e) {
            console.error(e);
        }
    }

    private async getCurrentUser(): Promise<string> {
        if (localStorage.getItem('insomnia-plugin-scalefast-sync.userId') === null) {
            try {
                const me = this.client.Users.current();
                localStorage.setItem('insomnia-plugin-scalefast-sync.userId', me.username);
            } catch (e) {
                console.error(e);
                throw 'Unable to retrieve current user for given token via GitlabProvider API.'
            }

        }

        return localStorage.getItem('insomnia-plugin-scalefast-sync.userId');
    }

    async initRemoteWorkspaceFile(): Promise<void> {
        try {
            await this.client.RepositoryFiles.create(
                this.config.projectId,
                this.config.configFileName,
                "master",
                "{}",
                "Initialized empty workspace file: " + this.config.configFileName
            );
        } catch (e) {
            console.error(e.response);
            throw 'Creating a new file via GitLab API failed.'
        }
    }

    private async createRemoteUserBranch(): Promise<string> {
        try {
            const branchName = await this.getCurrentUser() + "_collection_updates";
            if (await this.getBranch(branchName) === null) {
                await this.client.Branches.create(this.config.projectId, branchName, "master");
            }

            return branchName;

        } catch (e) {
            console.error(e.response);
            throw 'Creating a new branch via GitLab API failed.'
        }
    }

}
