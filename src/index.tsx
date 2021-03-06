import * as React from 'react';
import * as ReactDom from 'react-dom';
import sha256 from 'crypto-js/sha256';

import {GitlabProvider} from './providers/GitlabProvider';
import {UserConfig} from './interfaces/UserConfig';
import {ConfirmDialog} from "./components/ConfirmDialog";
import {GitlabConfigForm} from "./components/GitlabConfigForm";
import {VersionLabelHelper} from "./helpers/VersionLabelHelper";
import {WorkspaceHelper} from "./helpers/WorkspaceHelper";
import './workspace.module.css';
import {IntervalFunction} from "./types/IntervalFunction";

const TIME_MINUTE = 60000;
const RELEASE_INTERVAL_DURATION = TIME_MINUTE * 10;
const GITLAB_INTERVAL_DURATION = TIME_MINUTE;
const COMMIT_STATUS_INTERVAL_DURATION = 2000;

const COMMIT_STATUS_RELEASE = "release";
const COMMIT_STATUS_COMMITTED = "committed";
const COMMIT_STATUS_DIRTY = "dirty";

let intervals = [];

async function requestMergeAction(context): Promise<boolean>|null {
    try {
        if (!await GitlabConfigForm.isConfigured(context)) {
            await context.app.alert('Plugin not configured', 'Plugin is not configured. Please, run plugin setup before continue.');
            return false;
        }

        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new GitlabProvider(config);
        if (await gitlabProvider.branchExists()) {
            if (await gitlabProvider.getCurrentMergeRequest() === null) {
                const mergeRequestTitle = await context.app.prompt(
                    'Set new merge request title:', {
                        label: 'Merge request title',
                        defaultValue: 'Tell us what are you doing...',
                        submitName: 'Submit',
                        cancelable: true,
                    }
                );

                config.mergeRequestId = await gitlabProvider.createMergeRequest(mergeRequestTitle);
                localStorage.setItem('insomnia-plugin-scalefast-sync.mergeRequestTitle', mergeRequestTitle);
            } else {
                await context.app.alert('Merge request', 'There is an already openend merge request from your work branch to master branch. Please, close or merge this one before creating new one.');
            }
        } else {
            await context.app.alert('Work branch not found', 'You are trying to request merge before pushing anything. Please push changes before requesting merge.');
        }



    } catch (e) {
        console.error(e);
        await context.app.alert('Error!', 'There was an error trying to create the merge request.');
    }
}

async function pushWorkspaceAction(context, data) {
    try {
        if (!await GitlabConfigForm.isConfigured(context)) {
            await context.app.alert('Plugin not configured', 'Plugin is not configured. Please, run plugin setup before continue.');
            return false;
        }

        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new GitlabProvider(config);
        const workspaceData = await WorkspaceHelper.prepareWorkspace(context, data);

        const commitMessage = await context.app.prompt(
            'GitLab - Push Workspace - Commit Message', {
                label: 'Commit Message',
                defaultValue: 'Update workspace',
                submitName: 'Commit',
                cancelable: true,
            }
        );

        config.currentCommit = await gitlabProvider.pushWorkspace(
            JSON.stringify(
                workspaceData,
                null,
                2
            ),
            commitMessage
        );

        await GitlabConfigForm.saveConfig(context, config);
        localStorage.setItem('insomnia-plugin-scalefast-sync.currentRelease', 'local');
        localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_COMMITTED);
        localStorage.setItem('insomnia-plugin-scalefast-sync.commitId', config.currentCommit);
        localStorage.setItem('insomnia-plugin-scalefast-sync.workspace', JSON.stringify(workspaceData));

        VersionLabelHelper.update();

        await context.app.alert('Success!', 'Your workspace data was successfully pushed.');

    } catch (e) {
        console.error(e);
        await context.app.alert('Error!', 'Something went wrong. Please try pushing again and check your setup.');
    }
}

async function pullWorkspaceAction(context, data, force: boolean = false) {
    try {
        if (!await GitlabConfigForm.isConfigured(context)) {
            await context.app.alert('Plugin not configured', 'Plugin is not configured. Please, run plugin setup before continue.');
            return false;
        }

        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new GitlabProvider(config);
        const state = localStorage.getItem('insomnia-plugin-scalefast-sync.commitStatus');

        if (state !== COMMIT_STATUS_DIRTY || force) {
            let workspace = await gitlabProvider.pullWorkspace(null, "raw");
            workspace = await WorkspaceHelper.fixWorkspace(workspace, data.workspace._id);

            await context.data.import.raw(workspace, {
                workspaceId: data.workspace._id,
                workspaceScope: "collection"
            });

            config.currentRelease = "local";

            await GitlabConfigForm.saveConfig(context, config);

            console.debug('[insomnia-plugin-scalefast-sync] Workspace updated to user branch copy.');
            await context.app.alert('Success!', 'Your current workspace has been updated to the last commit in your work branch.');

            localStorage.setItem('insomnia-plugin-scalefast-sync.currentRelease', "local");
            localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_COMMITTED);
            localStorage.setItem('insomnia-plugin-scalefast-sync.workspace', workspace);

            VersionLabelHelper.update();
        } else {
            await createWarningDialog(context, data);
        }

    } catch (e) {
        console.error(e);
        throw e;
    }
}

async function getWorkspaceRelease(context, data, tag, force = false) {
    try {
        if (!await GitlabConfigForm.isConfigured(context)) {
            await context.app.alert('Plugin not configured', 'Plugin is not configured. Please, run plugin setup before continue.');
            return false;
        }

        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new GitlabProvider(config);
        const state = localStorage.getItem('insomnia-plugin-scalefast-sync.commitStatus');

        if (state !== COMMIT_STATUS_DIRTY || force) {
            let workspace = await gitlabProvider.pullWorkspace(tag, "raw");
            workspace = await WorkspaceHelper.fixWorkspace(workspace, data.workspace._id);

            await context.data.import.raw(workspace, {
                workspaceId: data.workspace._id,
                workspaceScope: "collection"
            });

            config.currentRelease = tag;

            await GitlabConfigForm.saveConfig(context, config);

            console.debug('[insomnia-plugin-scalefast-sync] Workspace updated to version: v' + tag);
            await context.app.alert('Success!', 'Your current workspace has been updated to the latest version available: v' + tag);

            localStorage.setItem('insomnia-plugin-scalefast-sync.currentRelease', tag);
            localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_RELEASE);
            localStorage.setItem('insomnia-plugin-scalefast-sync.workspace', workspace);

            VersionLabelHelper.update();
        } else {
            await createWarningDialog(context, data, tag);
        }
    } catch (e) {
        console.error(e);
        throw e;
    }
}

async function installInterval(callback: IntervalFunction, timeout: number, context: any, data: any) {
    const id = sha256(callback.name);
    if (typeof intervals[id] === "undefined" || intervals[id] === null) {
        console.debug('[insomnia-plugin-scalefast-sync] Installing interval with id: ' + id + ' for function ' + callback.name);
        intervals[id] = window.setInterval(function () {
            callback(context, data)
        },timeout);
    }
}

async function installIntervals(context: any, data: any) {
    await installInterval(checkReleaseStatus, RELEASE_INTERVAL_DURATION, context, data);
    await installInterval(checkCommitStatus, COMMIT_STATUS_INTERVAL_DURATION, context, data);
    await installInterval(checkGitlabStatus, GITLAB_INTERVAL_DURATION, context, data);
}

async function checkReleaseStatus(context, data): Promise<void> {
    try {
        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new GitlabProvider(config);
        const latestRelease = await gitlabProvider.fetchLastTag();

        console.debug('[insomnia-plugin-scalefast-sync] Checking for new workspace release...');

        if (latestRelease.name !== config.currentRelease) {
            await createConfirmDialog(context, data, latestRelease.name)
        }

    } catch (e) {
        console.error(e);
        throw e;
    }
}

async function checkCommitStatus(context: any, data: any): Promise<void> {
    const workspaceData = localStorage.getItem("insomnia-plugin-scalefast-sync.workspace");
    const release = localStorage.getItem("insomnia-plugin-scalefast-sync.currentRelease");

    const localWorkspace = await WorkspaceHelper.getCurrentWorkspace(context, data, "json");
    const remoteWorkspace = JSON.parse(workspaceData);

    if (
        (typeof remoteWorkspace !== "undefined" && remoteWorkspace !== null) &&
        (typeof localWorkspace !== "undefined" && localWorkspace !== null)
    ) {
        if (!WorkspaceHelper.isEqual(localWorkspace, remoteWorkspace)) {
            localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_DIRTY);
        } else {
            if (release === "local") {
                localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_COMMITTED);
            } else {
                localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_RELEASE);
            }
        }
        VersionLabelHelper.update();
    }
}

async function checkGitlabStatus(context: any): Promise<void> {
    const config: UserConfig = await GitlabConfigForm.loadConfig(context);
    const provider = new GitlabProvider(config);

    if (await provider.branchExists()) {
        const branch = await provider.getBranch();
        const mr = await provider.getCurrentMergeRequest();

        localStorage.setItem('insomnia-plugin-scalefast-sync.commitId', branch.commit.short_id);
        if (mr !== null) {
            localStorage.setItem('insomnia-plugin-scalefast-sync.mergeRequestTitle', mr.title);
            localStorage.setItem('insomnia-plugin-scalefast-sync.mergeRequestId', mr.iid);
        } else {
            localStorage.removeItem('insomnia-plugin-scalefast-sync.mergeRequestTitle');
            localStorage.removeItem('insomnia-plugin-scalefast-sync.mergeRequestId');
        }
    } else {
        localStorage.removeItem('insomnia-plugin-scalefast-sync.commitId');
        localStorage.removeItem('insomnia-plugin-scalefast-sync.mergeRequestTitle');
        localStorage.removeItem('insomnia-plugin-scalefast-sync.mergeRequestId');
    }

    VersionLabelHelper.update();
}

async function createConfirmDialog(context, models, version) {
    const root = document.createElement('div');
    ReactDom.render(<ConfirmDialog
            message={"There is an updated workspace version available: v" + version + ". Do you want to update?"}
            confirmCallback={async () => await getWorkspaceRelease(context, models, version)}
            cancelCallback={() => console.debug('[insomnia-plugin-scalefast-sync] Workspace update cancelled by user.')}
            type={"info"}
            context={context}/>,
        root
    );

    context.app.dialog('New workspace available', root, {
        skinny: true,
        onHide() {
            ReactDom.unmountComponentAtNode(root);
        },
    });

}

async function createWarningDialog(context, models, version: string = null) {
    const root = document.createElement('div');
    const callback = version === null ?
        async () => await pullWorkspaceAction(context, models, true) :
        async () => await getWorkspaceRelease(context, models, version, true);

    ReactDom.render(<ConfirmDialog
            message={"Possible uncommitted workspace changes will be lost if you continue. Do you want to update?"}
            confirmCallback={callback}
            cancelCallback={() => console.debug('[insomnia-plugin-scalefast-sync] Workspace update cancelled by user.')}
            type={"warning"}
            context={context}/>,
        root
    );

    context.app.dialog('Uncommitted changes detected', root, {
        skinny: true,
        onHide() {
            ReactDom.unmountComponentAtNode(root);
        },
    });
}

async function createPluginConfigDialog(context, models) {
    const root = document.createElement('div');
    ReactDom.render(<GitlabConfigForm context={context} models={models}/>, root);

    context.app.dialog('GitLab - Setup', root, {
        skinny: true,
        onHide() {
            ReactDom.unmountComponentAtNode(root);
        },
    });
}

async function getCurrentReleaseAction(context, models) {
    try {
        if (!await GitlabConfigForm.isConfigured(context)) {
            await context.app.alert('Plugin not configured', 'Plugin is not configured. Please, run plugin setup before continue.');
            return false;
        }

        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new GitlabProvider(config);

        const latestTag = await gitlabProvider.fetchLastTag();

        if (latestTag.name !== config.currentRelease) {
            await getWorkspaceRelease(context, models, latestTag.name);
        } else {
            await context.app.alert('Info', 'You are using the most recent workspace release: v' + latestTag.name);
        }

    } catch (e) {
        console.error(e);
        await context.app.alert('Error!', 'Something went wrong. Please try pulling again and check your setup.');
    }
}

const workspaceActions = [
    {
        label: 'Gitlab - Setup',
        icon: 'fa-gitlab',
        async action(context, data) {
            await createPluginConfigDialog(context, data);
            await installIntervals(context, data);
        }
    },
    {
        label: 'GitLab - Get current release',
        icon: 'fa-cube',
        action: async (context, data) => {
            await getCurrentReleaseAction(context, data);
            await installIntervals(context, data);
        },
    },
    {
        label: 'GitLab - Push Workspace',
        icon: 'fa-arrow-up',
        action: async (context, data) => {
            await pushWorkspaceAction(context, data);
            await installIntervals(context, data);
        },
    },
    {
        label: 'GitLab - Pull Workspace',
        icon: 'fa-arrow-down',
        action: async (context, data) => {
            await pullWorkspaceAction(context, data);
            await installIntervals(context, data);
        },
    },
    {
        label: 'GitLab - Request Merge',
        icon: 'fa-code-fork',
        action: async (context, data) => {
            await requestMergeAction(context);
            await installIntervals(context, data);
        },
    }
];

VersionLabelHelper.update();

export {workspaceActions}