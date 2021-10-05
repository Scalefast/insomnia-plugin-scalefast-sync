import {Gitlab} from './gitProviders/gitlab';
import {UserConfig} from './interfaces/UserConfig';
import {ConfirmDialog} from "./components/ConfirmDialog";
import {GitlabConfigForm} from "./components/GitlabConfigForm";
import {VersionLabelHelper} from "./helpers/VersionLabelHelper";
import {WorkspaceHelper} from "./helpers/WorkspaceHelper";

import * as React from 'react';
import * as ReactDom from 'react-dom';
import {isEqual} from "lodash";
import './workspace.module.css';

const INTERVAL_DURATION = 60000 * 10;

const COMMIT_STATUS_RELEASE = "release";
const COMMIT_STATUS_COMMITTED = "committed";
const COMMIT_STATUS_DIRTY = "dirty";

let workspaceCheckingInterval = null;
let commitStatusInterval = null;

async function getCurrentWorkspace(context, models) {
    let workspaceData = await context.data.export.insomnia({
        includePrivate: false,
        format: 'json',
        workspace: models.workspace
    });

    return JSON.parse(workspaceData);
}

async function requestMergeAction(context): Promise<boolean>|null {
    try {
        if (!await GitlabConfigForm.isConfigured(context)) {
            await context.app.alert('Plugin not configured', 'Plugin is not configured. Please, run plugin setup before continue.');
            return false;
        }

        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new Gitlab(config);
        if (!await gitlabProvider.isMergeRequestOpen()) {
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

    } catch (e) {
        console.error(e);
        await context.app.alert('Error!', 'There was an error trying to create the merge request.');
    }
}

async function pushWorkspaceAction(context, models) {
    try {
        if (!await GitlabConfigForm.isConfigured(context)) {
            await context.app.alert('Plugin not configured', 'Plugin is not configured. Please, run plugin setup before continue.');
            return false;
        }

        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new Gitlab(config);
        const workspaceData = await getCurrentWorkspace(context, models);

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

        if (await gitlabProvider.isMergeRequestOpen() === false && config.autoCreateMergeRequest === true) {
            await requestMergeAction(context);
        }

        await GitlabConfigForm.saveConfig(context, config);
        localStorage.setItem('insomnia-plugin-scalefast-sync.currentRelease', 'local');
        localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_COMMITTED);
        localStorage.setItem('insomnia-plugin-scalefast-sync.commitId', config.currentCommit);
        localStorage.setItem('insomnia-plugin-scalefast-sync.workspaceData', JSON.stringify(workspaceData));

        VersionLabelHelper.update();

        await context.app.alert('Success!', 'Your workspace data was successfully pushed.');

    } catch (e) {
        console.error(e);
        await context.app.alert('Error!', 'Something went wrong. Please try pushing again and check your setup.');
    }
}

async function pullWorkspaceAction(context, models, force: boolean = false) {
    try {
        if (!await GitlabConfigForm.isConfigured(context)) {
            await context.app.alert('Plugin not configured', 'Plugin is not configured. Please, run plugin setup before continue.');
            return false;
        }

        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new Gitlab(config);
        const state = localStorage.getItem('insomnia-plugin-scalefast-sync.commitStatus');

        if (state !== COMMIT_STATUS_DIRTY || force) {
            const workspace = await gitlabProvider.pullWorkspace();
            await context.data.import.raw(JSON.stringify(workspace));

            config.currentRelease = "local";

            await GitlabConfigForm.saveConfig(context, config);

            console.debug('[insomnia-plugin-scalefast-sync] Workspace updated to user branch copy.');
            await context.app.alert('Success!', 'Your current workspace has been updated to the last commit in your work branch.');

            localStorage.setItem('insomnia-plugin-scalefast-sync.currentRelease', "local");
            localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_COMMITTED);
            localStorage.setItem('insomnia-plugin-scalefast-sync.workspaceData', JSON.stringify(workspace));

            VersionLabelHelper.update();
        } else {
            await createWarningDialog(context, models);
        }

    } catch (e) {
        console.error(e);
        throw e;
    }
}

async function getWorkspaceRelease(context, models, tag, force = false) {
    try {
        if (!await GitlabConfigForm.isConfigured(context)) {
            await context.app.alert('Plugin not configured', 'Plugin is not configured. Please, run plugin setup before continue.');
            return false;
        }

        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new Gitlab(config);
        const state = localStorage.getItem('insomnia-plugin-scalefast-sync.commitStatus');

        if (state !== COMMIT_STATUS_DIRTY || force) {
            const workspace = await gitlabProvider.pullWorkspace(tag);
            await context.data.import.raw(JSON.stringify(workspace));

            config.currentRelease = tag;

            await GitlabConfigForm.saveConfig(context, config);

            console.debug('[insomnia-plugin-scalefast-sync] Workspace updated to version: v' + tag);
            await context.app.alert('Success!', 'Your current workspace has been updated to the latest version available: v' + tag);

            localStorage.setItem('insomnia-plugin-scalefast-sync.currentRelease', tag);
            localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_RELEASE);
            localStorage.setItem('insomnia-plugin-scalefast-sync.workspaceData', JSON.stringify(workspace));

            VersionLabelHelper.update();
        } else {
            await createWarningDialog(context, models, tag);
        }
    } catch (e) {
        console.error(e);
        throw e;
    }
}

async function initWorkspaceInterval(context, models) {
    if (workspaceCheckingInterval === null) {
        console.debug('[insomnia-plugin-scalefast-sync] Installing interval to check for new workspace releases.');
        workspaceCheckingInterval = window.setInterval(async function () {
            await startChecking(context, models)
        }, INTERVAL_DURATION)
    }
}

async function initCommitStatusInterval(context, models) {
    if (commitStatusInterval === null) {
        console.debug('[insomnia-plugin-scalefast-sync] Installing dirty interval (thanks Kong for the plugin API :p) to monitor workspace changes.');
        commitStatusInterval = window.setInterval(async function () {
            const workspaceData = JSON.parse(localStorage.getItem("insomnia-plugin-scalefast-sync.workspaceData"));
            const release = localStorage.getItem("insomnia-plugin-scalefast-sync.currentRelease");
            const currentWorkspace = await getCurrentWorkspace(context, models);

            if (!WorkspaceHelper.isEqual(currentWorkspace,workspaceData)) {
                localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_DIRTY);
            } else {
                if (release === "local") {
                    localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_COMMITTED);
                } else {
                    localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_RELEASE);
                }
            }
            VersionLabelHelper.update();
        }, 2000);
    }
}

async function startChecking(context, models) {
    try {
        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new Gitlab(config);
        const latestRelease = await gitlabProvider.fetchLastTag();

        console.debug('[insomnia-plugin-scalefast-sync] Checking for new workspace release...');

        if (latestRelease.name !== config.currentRelease) {
            await createConfirmDialog(context, models, latestRelease.name)
        }

    } catch (e) {
        console.error(e);
        throw e;
    }
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
        const gitlabProvider = new Gitlab(config);

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
        async action(context, models) {
            await createPluginConfigDialog(context, models);
            await initWorkspaceInterval(context, models);
            await initCommitStatusInterval(context, models);
        }
    },
    {
        label: 'GitLab - Get current release',
        icon: 'fa-cube',
        action: async (context, models) => {
            await getCurrentReleaseAction(context, models);
            await initWorkspaceInterval(context, models);
            await initCommitStatusInterval(context, models);
        },
    },
    {
        label: 'GitLab - Push Workspace',
        icon: 'fa-arrow-up',
        action: async (context, models) => {
            await pushWorkspaceAction(context, models);
            await initWorkspaceInterval(context, models);
            await initCommitStatusInterval(context, models);
        },
    },
    {
        label: 'GitLab - Pull Workspace',
        icon: 'fa-arrow-down',
        action: async (context, models) => {
            await pullWorkspaceAction(context, models);
            await initWorkspaceInterval(context, models);
            await initCommitStatusInterval(context, models);
        },
    },
    {
        label: 'GitLab - Request Merge',
        icon: 'fa-code-fork',
        action: async (context, models) => {
            await requestMergeAction(context);
            await initWorkspaceInterval(context, models);
            await initCommitStatusInterval(context, models);
        },
    }
];

VersionLabelHelper.update();

export {workspaceActions}