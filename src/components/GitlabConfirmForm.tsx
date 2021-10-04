import * as React from "react";
import {UserConfig} from "../interfaces/UserConfig";
import {Gitlab} from "../gitProviders/gitlab";

export class GitlabConfigForm extends React.Component<any, any> {

    constructor(props) {
        super(props);
        this.state = {
            'baseUrl': "",
            'token': "",
            'projectId': null,
            'configFileName': "",
            'branch': "",
            'branches': [],
            'createMergeRequest': true,
            'mergeRequestId': null,
            'mergeRequestTitle': null,
            'currentTag': null,
            'tags': []
        };

        this.handleChange = this.handleChange.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
    }

    async componentDidMount() {
        const config: UserConfig = await GitlabConfigForm.loadConfig(this.props.context);
        this.setState(config);

        await this.loadBranches();
    }

    private handleChange(event) {
        const {target: {name, value}} = event;
        console.debug("[insomnia-plugin-scalefast-sync] Update state property: ", name, value);
        this.setState({[name]: value});
    }

    private async handleSubmit(event) {
        try {
            await GitlabConfigForm.saveConfig(this.props.context, this.state as UserConfig);
            await this.props.context.app.alert('Success!', 'To change your configuration, just start the setup again.');
        } catch (e) {
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
            'branches': branchOptions
        });
    }

    static async saveConfig(context, userConfig: UserConfig) {
        await context.store.setItem('gitlab-sync:config', JSON.stringify(userConfig));
        localStorage.setItem('insomnia-plugin-scalefast-sync.currentTag', userConfig.currentTag);
    }

    static async loadConfig(context): Promise<UserConfig | null> {
        const storedConfig = await context.store.getItem('gitlab-sync:config');
        try {
            return JSON.parse(storedConfig);
        } catch(e) {
            return null;
        }
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
