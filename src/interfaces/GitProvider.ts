export interface GitProvider {
    branchExists(branchName: string): Promise<boolean>
    getBranch(branchName: string): Promise<any>
    pullWorkspace(ref: string): Promise<any>
    pushWorkspace(content: string, messageCommit: string): Promise<string> | null
    createMergeRequest(mergeRequestTitle): Promise<number> | null
    getCurrentMergeRequest(): Promise<any> | null
    fetchBranches(): Promise<string[]>
    fetchTags(): Promise<string[]>
    fetchLastTag(): Promise<any>
}