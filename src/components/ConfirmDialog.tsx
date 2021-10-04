import * as React from "react";

const DIALOG_TYPE_INFO: string = "info";
const DIALOG_TYPE_WARNING: string = "warning";
const DIALOG_TYPE_NOTICE: string = "notice";
const DIALOG_TYPE_SURPRISE: string = "surprise";
const DIALOG_TYPE_DANGER: string = "danger";
const DIALOG_TYPE_SUCCESS: string = "success";
const DIALOG_TYPE_ERROR: string = "error";

export class ConfirmDialog extends React.Component<any, any> {
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
