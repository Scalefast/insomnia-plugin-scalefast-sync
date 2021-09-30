import {Gitlab} from './gitProviders/gitlab';
import {UserConfig} from './interfaces/UserConfig';
import * as React from 'react';
import * as ReactDom from 'react-dom';
import './workspace.module.css';

const INTERVAL_DURATION = 60000*10;
let workspaceCheckingInterval = null;

class ConfirmDialog extends React.Component<any, any> {
    private readonly id: string;
    constructor(props) {
        super(props);
        this.state = {
            open: false
        };

        this.id = "workspace-confirmation-dialog";

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
                    <p>There is an updated workspace version available: v{this.props.version}. Do you want to update?</p>
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
}

async function pushWorkspace(context, models) {
    try {
        const config: UserConfig = await loadConfig(context);

        var commitMessage = await context.app.prompt(
            'GitLab - Push Workspace - Commit Message', {
                label: 'Commit Message',
                defaultValue: 'Update workspace',
                submitName: 'Commit',
                cancelable: true,
            }
        );

        let workspaceData = await context.data.export.insomnia({
            includePrivate: false,
            format: 'json',
            workspace: models.workspace
        });

        const gitlabProvider = new Gitlab(config);

        // parse, format, stringify again. Ugly but necessary because of Insomnia API design
        await gitlabProvider.pushWorkspace(
            JSON.stringify(
                JSON.parse(workspaceData), // is already stringified JSON
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
            await storeConfig(context, config);

        }

        await context.app.alert('Success!', 'Your workspace config was successfully pushed.');
    } catch (e) {
        console.error(e);
        await context.app.alert('Error!', 'Something went wrong. Please try pushing again and check your setup.');
    }
}

async function pullWorkspace(context, tag) {
    try {
        const config: UserConfig = await loadConfig(context);
        const gitlabProvider = new Gitlab(config);

        const workspace = await gitlabProvider.pullWorkspace(tag);
        await context.data.import.raw(JSON.stringify(workspace));

        config.currentTag = tag;

        await storeConfig(context, config);

        console.debug('[insomnia-plugin-scalefast-sync] Workspace updated to version: v' + tag);
        await context.app.alert('Success!', 'Your current workspace has been updated to the latest version available: v' + tag);
        await updateVersionLabel(tag);

    } catch(e) {
        console.error(e);
        throw e;
    }
}

async function updateVersionLabel(tag) {
    let element = document.getElementById('workspace-version-label');
    if (typeof(element) !== 'undefined' && element !== null) {
        element.textContent = "v" + tag;
    } else {
        const target = document.querySelector('div.sidebar__item').querySelector('div.sidebar__expand');

        element = document.createElement('span');
        element.id = 'workspace-version-label';
        element.textContent = "v" + tag;
        element.className = "version-label";
        target.insertAdjacentElement('beforebegin', element);
    }
}

async function initWorkspaceInterval(context) {
    console.debug(workspaceCheckingInterval);
    if (workspaceCheckingInterval === null) {
        workspaceCheckingInterval = window.setInterval(async function () {
            await startChecking(context)
        }, INTERVAL_DURATION)
    }
}

async function startChecking(context) {
    try {
        const config: UserConfig = await loadConfig(context);
        const gitlabProvider = new Gitlab(config);
        const latestTag = await gitlabProvider.fetchLastTag();

        console.debug('[insomnia-plugin-scalefast-sync] Checking for new workspace release...');

        if (latestTag.name !== config.currentTag) {
            await createConfirmDialog(context, latestTag.name)
        }

    } catch (e) {
        console.error(e);
        throw e;
    }
}

async function createConfirmDialog(context, version) {
    const root = document.createElement('div');
    ReactDom.render(<ConfirmDialog
        version={version}
        confirmCallback={async () => await pullWorkspace(context, version)}
        cancelCallback={() => console.debug('[insomnia-plugin-scalefast-sync] Workspace update cancelled by user.')}
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

async function checkNewRelease(context) {
    try {
        const config: UserConfig = await loadConfig(context);
        const gitlabProvider = new Gitlab(config);

        const latestTag = await gitlabProvider.fetchLastTag();

        if (latestTag.name === config.currentTag) {
            await pullWorkspace(context, latestTag.name);
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
            await initWorkspaceInterval(context);
        }
    },
    {
        label: 'GitLab - Pull Workspace',
        icon: 'fa-arrow-down',
        action: async(context) => {
            await checkNewRelease(context);
            await initWorkspaceInterval(context);
        },
    },
    {
        label: 'GitLab - Push Workspace',
        icon: 'fa-arrow-up',
        action: async(context, models) => {
            await pushWorkspace(context, models);
            await initWorkspaceInterval(context);
        },
    }
    /*
    {
        label: 'GitLab - Test',
        icon: 'fa-gitlab',
        action: async(context, models) => {
            await updateVersionLabel("0.9.1");
        },
    }
    */
];

export { workspaceActions }