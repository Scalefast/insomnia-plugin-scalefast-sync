import {Gitlab} from './gitProviders/gitlab';
import {UserConfig} from './interfaces/UserConfig';
import * as React from 'react';
import * as ReactDom from 'react-dom';
import _ from 'lodash';
import sha256 from 'crypto-js/sha256';
import './workspace.module.css';

const INTERVAL_DURATION = 60000*10;

const DIALOG_TYPE_INFO: string = "info";
const DIALOG_TYPE_WARNING: string = "warning";
const DIALOG_TYPE_NOTICE: string = "notice";
const DIALOG_TYPE_SURPRISE: string = "surprise";
const DIALOG_TYPE_DANGER: string = "danger";
const DIALOG_TYPE_SUCCESS: string = "success";
const DIALOG_TYPE_ERROR: string = "error";

const COMMIT_STATUS_RELEASE = "release";
const COMMIT_STATUS_COMMITTED = "committed";
const COMMIT_STATUS_DIRTY = "dirty";

let workspaceCheckingInterval = null;
let commitStatusInterval = null;

class ConfirmDialog extends React.Component<any, any> {
    private readonly id: string;
    private readonly class: string;

    constructor(props) {
        super(props);
        this.state = {
            open: false
        };

        this.id = "workspace-confirmation-dialog";
        this.class = this.computeClass(this.props.type);

        this.handleConfirm = this.handleConfirm.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.handleChange = this.handleChange.bind(this);
    }

    private handleChange(event) {
        const { target: { name, value } } = event;
        console.debug("[insomnia-plugin-scalefast-sync] Update state property: ", name, value);
        this.setState({[name]: value});
    }

    private handleConfirm(event) {
        this.props.confirmCallback();
        document.getElementById(this.id).parentNode.parentNode.parentNode.parentNode.querySelector('button').click()
    }

    private handleCancel(event) {
        this.props.cancelCallback();
        document.getElementById(this.id).parentNode.parentNode.parentNode.parentNode.querySelector('button').click()
    }

    private getIconForType(type: string = DIALOG_TYPE_INFO) {
        if (typeof this.props.icon === "undefined") {
            let iconClass = "fa fa-info-circle";
            switch (type) {
                case DIALOG_TYPE_INFO:
                case DIALOG_TYPE_NOTICE:
                default:
                    iconClass = "fa fa-info-circle";
                    break;
                case DIALOG_TYPE_WARNING:
                    iconClass = "fa fa-exclamation-triangle";
                    break;
                case DIALOG_TYPE_DANGER:
                    iconClass = "fa fa-skull-crossbones";
                    break;
                case DIALOG_TYPE_SURPRISE:
                    iconClass = "fa fa-surprise";
                    break;
                case DIALOG_TYPE_SUCCESS:
                    iconClass = "fa fa-check-circle"
                    break;
                case DIALOG_TYPE_ERROR:
                    iconClass = "fa fa-bomb"
                    break;
            }

            return iconClass;
        }

        return this.props.icon;
    }

    private computeClass(type:string = DIALOG_TYPE_INFO) {
        return this.getIconForType(type) + " dialog-icon dialog-" + type;
    }

    private flexContainerStyle = {
        'display': 'flex'
    }

    private confirmButtonStyle = {
        'display': 'flex',
        'flex-direction': 'row-reverse',
        'flex-basis': '50%'
    }

    private cancelButtonStyle = {
        'display': 'flex',
        'flex-direction': 'row',
        'flex-basis': '50%'
    }

    render() {
        return (
            <form className="pad" id={this.id}>
                <div className="form-control form-control--outlined">
                    <i className={this.class} />
                    <p>{this.props.message}</p>
                </div>
                <div style={this.flexContainerStyle}>
                    <div className="margin-top" style={this.cancelButtonStyle}>
                        <button type="button" onClick={this.handleConfirm}>Yes</button>
                    </div>
                    <div className="margin-top" style={this.confirmButtonStyle}>
                        <button type="button" onClick={this.handleCancel}>No</button>
                    </div>
                </div>
            </form>
        );
    }

}

class GitlabConfigForm extends React.Component<any, any> {
    constructor(props) {
        super(props);
        this.state = {
            'baseUrl': "",
            'token': "",
            'projectId': null,
            'configFileName': "",
            'branch': "",
            'branchOptions': [],
            'createMergeRequest': true,
            'mergeRequestId': null,
            'mergeRequestTitle': null,
            'currentTag': null
        };

        this.handleChange = this.handleChange.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
    }

    async componentDidMount() {
        const config: UserConfig = await loadConfig(this.props.context);
        this.setState(config);

        await this.loadBranches();
    }

    private handleChange(event) {
        const { target: { name, value } } = event;
        console.debug("[insomnia-plugin-scalefast-sync] Update state property: ", name, value);
        this.setState({[name]: value});
    }

    private async handleSubmit(event) {
        try {
            await storeConfig(this.props.context, this.state as UserConfig);
            await this.props.context.app.alert('Success!', 'To change your configuration, just start the setup again.');
        } catch(e) {
            console.error(e);
            await this.props.context.app.alert('Error!', 'Something went wrong. Please start the setup again.');
        }
        event.preventDefault();
    }

    private async loadBranches() {
        const provider = new Gitlab(this.state);

        const branches: Array<any> = await provider.fetchBranches();
        const branchOptions = branches.map((b) => {
            let rObj = {};
            rObj['value'] = b;
            rObj['label'] = b;
            return rObj;
        });

        this.setState({
            'branch': this.state.branch ? this.state.branch : branches[0],
            'branchOptions': branchOptions
        });
    }

    private flexContainerStyle = {
        'display': 'flex'
    }

    private submitButtonStyle = {
        'display': 'flex',
        'flex-direction': 'row-reverse',
        'flex-basis': '50%'
    }

    render() {
        return (
            <form onSubmit={this.handleSubmit} className="pad">
                <div className="form-control form-control--outlined">
                    <label>
                        BaseURL:
                        <input name="baseUrl" type="text" placeholder="https://your.gitlab-instance.com" value={this.state.baseUrl} onChange={this.handleChange} />
                    </label>
                    <label>
                        Access Token:
                        <input name="token" type="text" placeholder="accessToken123" value={this.state.token} onChange={this.handleChange} />
                    </label>
                    <label>
                        Project ID:
                        <input name="projectId" type="text" placeholder="23" value={String(this.state.projectId)} onChange={this.handleChange} />
                    </label>
                    <label>
                        Workspace File Name:
                        <input name="configFileName" type="text" placeholder="config.json" value={this.state.configFileName} onChange={this.handleChange} />
                    </label>
                </div>
                <div style={this.flexContainerStyle}>
                    <div className="margin-top" style={this.submitButtonStyle}>
                        <button type="submit">Submit</button>
                    </div>
                </div>
            </form>
        );
      }
}

async function loadConfig(context): Promise<UserConfig | null> {
    const storedConfig = await context.store.getItem('gitlab-sync:config');
    try {
        return JSON.parse(storedConfig);
    } catch(e) {
        return null;
    }
}

async function storeConfig(context, userConfig: UserConfig) {
    await context.store.setItem('gitlab-sync:config', JSON.stringify(userConfig));
    localStorage.setItem('insomnia-plugin-scalefast-sync.currentTag', userConfig.currentTag);
}

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
        const config: UserConfig = await loadConfig(context);

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


        await storeConfig(context, config);

        await context.app.alert('Success!', 'Your workspace config was successfully pushed.');
    } catch (e) {
        console.error(e);
        await context.app.alert('Error!', 'Something went wrong. Please try pushing again and check your setup.');
    }
}

async function pullWorkspace(context, models, force: boolean = false) {
    try {
        const state = localStorage.getItem('insomnia-plugin-scalefast-sync.commitStatus');

        const config: UserConfig = await loadConfig(context);
        const gitlabProvider = new Gitlab(config);

        if (state !== COMMIT_STATUS_DIRTY || force) {
            const workspace = await gitlabProvider.pullWorkspace();
            await context.data.import.raw(JSON.stringify(workspace));

            config.currentTag = "local";

            await storeConfig(context, config);

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

        const config: UserConfig = await loadConfig(context);
        const gitlabProvider = new Gitlab(config);

        if (state !== COMMIT_STATUS_DIRTY || force) {
            const workspace = await gitlabProvider.pullWorkspace(tag);
            await context.data.import.raw(JSON.stringify(workspace));

            config.currentTag = tag;

            await storeConfig(context, config);

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
                return "fa fa-rocket";
            case COMMIT_STATUS_DIRTY:
                return "fa fa-cog";
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
                console.log(currentWorkspaceHash + "<==>" + workspaceHash);
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
        const config: UserConfig = await loadConfig(context);
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
        type={DIALOG_TYPE_INFO}
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
        async () => await getCurrentRelease(context, models, version);

    ReactDom.render(<ConfirmDialog
            message={"Possible uncommitted workspace changes will be lost if you continue. Do you want to update?"}
            confirmCallback={callback}
            cancelCallback={() => console.debug('[insomnia-plugin-scalefast-sync] Workspace update cancelled by user.')}
            type={DIALOG_TYPE_WARNING}
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
        const config: UserConfig = await loadConfig(context);
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
            await initCommitStatusInterval(context, models);
        }
    },
    {
        label: 'GitLab - Get current release',
        icon: 'fa-rocket',
        action: async(context, models) => {
            await checkNewRelease(context, models);
            await initWorkspaceInterval(context, models);
            await initCommitStatusInterval(context, models);
        },
    },
    {
        label: 'GitLab - Push Workspace',
        icon: 'fa-arrow-up',
        action: async(context, models) => {
            await pushWorkspace(context, models);
            await initWorkspaceInterval(context, models);
            await initCommitStatusInterval(context, models);
        },
    },
    {
        label: 'GitLab - Pull Workspace',
        icon: 'fa-arrow-down',
        action: async(context, models) => {
            await pullWorkspace(context, models);
            await initWorkspaceInterval(context, models);
            await initCommitStatusInterval(context, models);
        },
    },

];

updateVersionLabel();
export { workspaceActions }