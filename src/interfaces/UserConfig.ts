export interface UserConfig {
    'baseUrl': string,
    'token': string,
    'projectId': number,
    'configFileName': string,
    'branch': string,
    'autoCreateMergeRequest': boolean,
    'mergeRequestId': number,
    'currentRelease': string,
    'currentCommit': string,
    'isSynced': boolean
}