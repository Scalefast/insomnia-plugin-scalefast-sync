import {Gitlab} from './gitProviders/gitlab';
import {UserConfig} from './interfaces/UserConfig';
import {ConfirmDialog} from "./components/ConfirmDialog";
import {GitlabConfigForm} from "./components/GitlabConfirmForm";

import * as React from 'react';
import * as ReactDom from 'react-dom';
import _ from 'lodash';
import sha256 from 'crypto-js/sha256';
import './workspace.module.css';

const INTERVAL_DURATION = 60000*10;

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

async function pushWorkspace(context, models) {
    try {
        const config: UserConfig = await GitlabConfigForm.loadConfig(context);

        const commitMessage = await context.app.prompt(
            'GitLab - Push Workspace - Commit Message', {
                label: 'Commit Message',
                defaultValue: 'Update workspace',
                submitName: 'Commit',
                cancelable: true,
            }
        );

        const workspaceData = await getCurrentWorkspace(context, models);
        const gitlabProvider = new Gitlab(config);

        // parse, format, stringify again. Ugly but necessary because of Insomnia API design
        await gitlabProvider.pushWorkspace(
            JSON.stringify(
                workspaceData, // is already stringified JSON
                null,                      // replacer method
                2                          // indentation
            ),
            commitMessage
        );

        if (await gitlabProvider.isMergeRequestOpen() === false) {
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
        }

        localStorage.setItem('insomnia-plugin-scalefast-sync.currentTag', 'local');
        localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_COMMITTED);
        localStorage.setItem('insomnia-plugin-scalefast-sync.workspaceHash', sha256(JSON.stringify(workspaceData.resources)));


        await GitlabConfigForm.saveConfig(context, config);

        await context.app.alert('Success!', 'Your workspace config was successfully pushed.');
    } catch (e) {
        console.error(e);
        await context.app.alert('Error!', 'Something went wrong. Please try pushing again and check your setup.');
    }
}

async function pullWorkspace(context, models, force: boolean = false) {
    try {
        const state = localStorage.getItem('insomnia-plugin-scalefast-sync.commitStatus');

        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new Gitlab(config);

        if (state !== COMMIT_STATUS_DIRTY || force) {
            const workspace = await gitlabProvider.pullWorkspace();
            await context.data.import.raw(JSON.stringify(workspace));

            config.currentTag = "local";

            await GitlabConfigForm.saveConfig(context, config);

            console.debug('[insomnia-plugin-scalefast-sync] Workspace updated to user branch copy.');
            await context.app.alert('Success!', 'Your current workspace has been updated to the last commit in your work branch.');

            localStorage.setItem('insomnia-plugin-scalefast-sync.currentTag', "local");
            localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_COMMITTED);
            localStorage.setItem('insomnia-plugin-scalefast-sync.workspaceHash', sha256(JSON.stringify(workspace.resources)));

            updateVersionLabel();
        } else {
            await createWarningDialog(context, models);
        }
    } catch(e) {
        console.error(e);
        throw e;
    }
}

async function getCurrentRelease(context, models, tag, force = false) {
    try {
        const state = localStorage.getItem('insomnia-plugin-scalefast-sync.commitStatus');

        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new Gitlab(config);

        if (state !== COMMIT_STATUS_DIRTY || force) {
            const workspace = await gitlabProvider.pullWorkspace(tag);
            console.debug(workspace);
            await context.data.import.raw(JSON.stringify(workspace));

            config.currentTag = tag;

            await GitlabConfigForm.saveConfig(context, config);

            console.debug('[insomnia-plugin-scalefast-sync] Workspace updated to version: v' + tag);
            await context.app.alert('Success!', 'Your current workspace has been updated to the latest version available: v' + tag);

            localStorage.setItem('insomnia-plugin-scalefast-sync.currentTag', tag);
            localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_RELEASE);
            localStorage.setItem('insomnia-plugin-scalefast-sync.workspaceHash', sha256(JSON.stringify(workspace.resources)));

            updateVersionLabel();
        } else {
            await createWarningDialog(context, models, tag);
        }
    } catch(e) {
        console.error(e);
        throw e;
    }
}

function updateVersionLabel() { // TODO: HEAVY REFACTOR HERE!!
    let tag = localStorage.getItem('insomnia-plugin-scalefast-sync.currentTag');
    let state = localStorage.getItem('insomnia-plugin-scalefast-sync.commitStatus');

    function getLabelIcon(state: string) {
        switch (state) {
            case COMMIT_STATUS_RELEASE:
                return "fa fa-cube";
            case COMMIT_STATUS_DIRTY:
                return "fa fa-wrench";
            case COMMIT_STATUS_COMMITTED:
                return "fa fa-arrow-up"
        }
    }

    function getLabelTitle(state: string, version: string) {
        switch (state) {
            case COMMIT_STATUS_RELEASE:
                return "Scalefast Workspace Version: " + version;
            case COMMIT_STATUS_DIRTY:
                return "Local workspace: UNCOMMITTED!";
            case COMMIT_STATUS_COMMITTED:
                return "Local workspace - MR: " + localStorage.getItem('insomnia-plugin-scalefast-sync.mergeRequestTitle');
        }
    }

    if (tag !== null) {
        let isDomReady = window.setInterval(function (){
            if (document !== null) { // DOM is ready
                let element = document.getElementById('workspace-version-label');
                if (typeof element === "undefined" || element === null) {
                    const target = document.querySelector('div.sidebar__item').querySelector('div.sidebar__expand');
                    element = document.createElement('span');
                    element.id = 'workspace-version-label';
                    target.insertAdjacentElement('beforebegin', element);
                }

                const icon = document.createElement('i');
                icon.className = getLabelIcon(state);
                icon.style.setProperty('margin-right', '4px');
                element.textContent = tag === "local" ? "local workspace" : "v" + tag;
                element.className = "version-label " + state;
                element.title = getLabelTitle(state, tag);
                element.insertAdjacentElement('afterbegin', icon);

                window.clearInterval(isDomReady);
            }
        }, 200)
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
            const workspaceHash = localStorage.getItem("insomnia-plugin-scalefast-sync.workspaceHash");
            if (typeof workspaceHash !== "undefined") {
                const currentWorkspace = await getCurrentWorkspace(context, models);
                const currentWorkspaceHash = sha256(JSON.stringify(currentWorkspace.resources)).toString();
                if (currentWorkspaceHash !== workspaceHash) {
                    localStorage.setItem('insomnia-plugin-scalefast-sync.currentTag', "local");
                    localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', COMMIT_STATUS_DIRTY);
                    updateVersionLabel();
                }
            }
        }, 2000);
    }
}

async function startChecking(context, models) {
    try {
        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new Gitlab(config);
        const latestTag = await gitlabProvider.fetchLastTag();

        console.debug('[insomnia-plugin-scalefast-sync] Checking for new workspace release...');

        if (latestTag.name !== config.currentTag) {
            await createConfirmDialog(context, models, latestTag.name)
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
        confirmCallback={async () => await pullWorkspace(context, models, version)}
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
        async () => await pullWorkspace(context, models, true) :
        async () => await getCurrentRelease(context, models, version, true);

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

async function checkNewRelease(context, models) {
    try {
        const config: UserConfig = await GitlabConfigForm.loadConfig(context);
        const gitlabProvider = new Gitlab(config);

        const latestTag = await gitlabProvider.fetchLastTag();

        if (latestTag.name !== config.currentTag) {
            await getCurrentRelease(context, models, latestTag.name);
        } else {
            await context.app.alert('Info', 'You are using the most recent workspace release: v' + latestTag.name);
        }

    }
    catch (e) {
        console.error(e);
        await context.app.alert('Error!', 'Something went wrong. Please try pulling again and check your setup.');
    }
}

const workspaceActions = [
    {
        label: 'Gitlab - Setup',
        icon: 'fa-gitlab',
        async action(context, models) {
            const root = document.createElement('div');
            ReactDom.render(<GitlabConfigForm context={context}/>, root);

            context.app.dialog('GitLab - Setup', root, {
                skinny: true,
                onHide() {
                    ReactDom.unmountComponentAtNode(root);
                },
            });
            await initWorkspaceInterval(context, models);
            //await initCommitStatusInterval(context, models);
        }
    },
    {
        label: 'GitLab - Get current release',
        icon: 'fa-cube',
        action: async(context, models) => {
            await checkNewRelease(context, models);
            await initWorkspaceInterval(context, models);
            //await initCommitStatusInterval(context, models);
        },
    },
    {
        label: 'GitLab - Push Workspace',
        icon: 'fa-arrow-up',
        action: async(context, models) => {
            await pushWorkspace(context, models);
            await initWorkspaceInterval(context, models);
            //await initCommitStatusInterval(context, models);
        },
    },
    {
        label: 'GitLab - Pull Workspace',
        icon: 'fa-arrow-down',
        action: async(context, models) => {
            await pullWorkspace(context, models);
            await initWorkspaceInterval(context, models);
            //await initCommitStatusInterval(context, models);
        },
    },

];

updateVersionLabel();
export { workspaceActions }