import * as React from "react";
import {UserConfig} from "../interfaces/UserConfig";
import {GitlabProvider} from "../providers/GitlabProvider";
import {VersionLabelHelper} from "../helpers/VersionLabelHelper";

export class GitlabConfigForm extends React.Component<any, any> {
    private readonly id: string;

    constructor(props) {
        super(props);
        this.state = {
            'baseUrl': "",
            'token': "",
            'projectId': null,
            'configFileName': "",
            'branch': "",
            'branches': [],
            'autoCreateMergeRequest': false,
            'mergeRequestId': null,
            'mergeRequestTitle': null,
            'currentRelease': null,
            'releases': [],
            'currentCommit': null,
            'isSynced': false
        };

        this.id = "workspace-config-dialog";

        this.handleChange = this.handleChange.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
    }

    async componentDidMount() {
        const config: UserConfig = await GitlabConfigForm.loadConfig(this.props.context);
        this.setState(config);

        await this.loadBranches();
        await this.loadReleases();
    }

    private handleChange(event) {
        const {target: {name, value}} = event;
        console.debug("[insomnia-plugin-scalefast-sync] Update state property: ", name, value);
        this.setState({[name]: value});
    }

    private async handleSubmit(event) {
        try {
            await GitlabConfigForm.saveConfig(this.props.context, this.state as UserConfig);
            if (!this.state.isSynced) {
                await this.loadBranches();
                await this.loadReleases();
                await this.syncGitlabData();
            }

            document.getElementById(this.id).parentNode.parentNode.parentNode.parentNode.querySelector('button').click();

        } catch (e) {
            console.error(e);
            await this.props.context.app.alert('Error!', 'Something went wrong. Please start the setup again.');
        }
        event.preventDefault();
    }

    private async syncGitlabData() {
        const provider = new GitlabProvider(this.state);
        if (await provider.branchExists()) { // There are a work branch for current user
            const branch = await provider.getBranch();

            this.setState({
                'currentRelease': 'local',
                'branch': branch.name,
                'currentCommit': branch.commit.short_id,
            });

            const workspace = await provider.pullWorkspace();
            await this.props.context.data.import.raw(JSON.stringify(workspace));

            localStorage.setItem('insomnia-plugin-scalefast-sync.currentRelease', 'local');
            localStorage.setItem('insomnia-plugin-scalefast-sync.commitId', branch.commit.short_id);
            localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', 'committed');
            localStorage.setItem('insomnia-plugin-scalefast-sync.workspace', JSON.stringify(workspace));

            this.props.context.app.alert("Workspace synced", "Your local workspace have been synced with the most recent commit (" + branch.commit.short_id + ") in your work branch.");

            const mr = await provider.getCurrentMergeRequest();
            if (mr !== null) {
                this.setState({
                    'mergeRequestId': mr.iid,
                    "mergeRequestTitle": mr.title
                });

                localStorage.setItem('insomnia-plugin-scalefast-sync.mergeRequestTitle', mr.title);
                localStorage.setItem('insomnia-plugin-scalefast-sync.mergeRequestId', mr.iid);
            }
        } else { // No work branch so we search for most updated release
            const latestRelease = await provider.fetchLastTag();
            this.setState({
                'currentRelease': latestRelease.name,
                'branch': 'master'
            });

            const workspace = await provider.pullWorkspace(latestRelease.name);
            await this.props.context.data.import.raw(JSON.stringify(workspace));

            localStorage.setItem('insomnia-plugin-scalefast-sync.currentRelease', latestRelease.name);
            localStorage.setItem('insomnia-plugin-scalefast-sync.commitStatus', 'release');
            localStorage.setItem('insomnia-plugin-scalefast-sync.workspace', JSON.stringify(workspace));

            this.props.context.app.alert("Workspace synced", "Your local workspace have been synced with the most recent relase found v" + latestRelease.name);

        }

        this.setState({
            "isSynced": true
        });

        await GitlabConfigForm.saveConfig(this.props.context, this.state as UserConfig);
        VersionLabelHelper.update();

    }

    private async loadBranches() {
        const provider = new GitlabProvider(this.state);

        const branches: Array<any> = await provider.fetchBranches();
        const branchOptions = branches.map((b) => {
            let rObj = {};
            rObj['value'] = b;
            rObj['label'] = b;
            return rObj;
        });

        this.setState({
            'branch': this.state.branch ? this.state.branch : branches[0],
            'branches': branchOptions
        });
    }

    private async loadReleases() {
        const provider = new GitlabProvider(this.state);

        const tags: Array<any> = await provider.fetchTags();
        const releases = tags.map((b) => {
            let rObj = {};
            rObj['value'] = b;
            rObj['label'] = b;
            return rObj;
        });

        this.setState({
            'releases': releases
        });
    }

    static async saveConfig(context, userConfig: UserConfig) {
        await context.store.setItem('gitlab-sync:config', JSON.stringify(userConfig));
        localStorage.setItem('insomnia-plugin-scalefast-sync.currentRelease', userConfig.currentRelease);
    }

    static async loadConfig(context): Promise<UserConfig | null> {
        const storedConfig = await context.store.getItem('gitlab-sync:config');
        try {
            return JSON.parse(storedConfig);
        } catch(e) {
            return null;
        }
    }

    static async isConfigured(context): Promise<boolean> {
        const config = await this.loadConfig(context);
        if (config !== null) {
            return config.baseUrl !== "" && config.configFileName !== "" && config.token !== "" && config.projectId !== null;
        }

        return false;
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
            <form onSubmit={this.handleSubmit} className="pad" id={this.id}>
                <div className="form-control form-control--outlined">
                    <label>
                        BaseURL:
                        <input name="baseUrl" type="text" placeholder="https://your.gitlab-instance.com"
                               value={this.state.baseUrl} onChange={this.handleChange}/>
                    </label>
                    <label>
                        Access Token:
                        <input name="token" type="text" placeholder="accessToken123" value={this.state.token}
                               onChange={this.handleChange}/>
                    </label>
                    <label>
                        Project ID:
                        <input name="projectId" type="text" placeholder="23" value={String(this.state.projectId)}
                               onChange={this.handleChange}/>
                    </label>
                    <label>
                        Workspace File Name:
                        <input name="configFileName" type="text" placeholder="config.json"
                               value={this.state.configFileName} onChange={this.handleChange}/>
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
