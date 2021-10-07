# Gitlab Sync plugin for Insomnia API Client

This plugin for Insomnia aims to ease syncing your workspaces, directories or even single requests to your Git repositories. Right now GitLab is supported.
This plugin is based on [Insomnia Universal Git](https://insomnia.rest/plugins/insomnia-plugin-universal-git) and modified to adapt to Scalefast needs, so if you are not a Scalefast developer probably it doesn't make sense that you use this plugin, and I recommend you to install and use the aforementioned plugin.

## Installation

Just install it via the [Insomnia Plugin Hub](https://insomnia.rest/plugins) or using the Insomnia plugin interface and using

```
@scalefast/insomnia-plugin-scalefast-sync 
```
as npm package to install.

## Setup

* **Base URL**: GitLabs instance URL. (This could be a custom domain for enterprise gitlab instance)
* **Access Token**: Create an [access token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html) with "api" scope.
* **Project ID**: Enter the project id of the repository you want to use for syncing workspace. You will find it in the settings.
* **Workspace File Name**: The file your workspace will be stored under (JSON). Choose this freely.

![server configuration](https://i.postimg.cc/sgJLWJ5R/plugin-setup.png)

## How to use this plugin

This plugin has several features to keep your workspace synced with your repo, pull workspace from gitlab repository, push workspace changes to gitlab repository and request merge. Besides that three actions you can fetch and reset your local workspace to the latest stable release found in the repository.

After installing just hit the dropdown menu located right beneath the workspace/collections name, go through the setup and start pulling/pushing your config. The first time you configure the plugin it will search for your work branch and sync your local workspace with it if they found it, if not, it will sync your local workspace with the latest stable release in the repository.


![server configuration](https://i.postimg.cc/SRZBC7my/plugin-menu.png)

### Get current release
Using this option you can sync your local workspace with the latest stable release found in the repository.

### Push workspace
Pursuing simplicity and transparency for the user the push flow it as follows, every time the user tries to push changes:
- The plugin checks for the existence of branch with the form of username_collection_updates, if not found creates it.
- The plugin commits changes to the configured repository.
- If the branch is deleted as a merge result, the plugin will recreate it in the next push attempt.

### Pull workspace
Using this option, the plugin will sync your local workspace with the most recent commit in your work branch, you should be using this option to continue your work after a release sync, for example.

### Request merge
This option simply opens a new merge request between your work branch and the master branch. Use this option when you finish a feature, and want it to be merged and released to the rest of the team.

## UI Changes

The plugin modifies Insomnia UI to give you quick visual indications related to the state of your workspace, near the workspace name you will find a little pill with different colors depending on the status of your workspace in a given moment.

If you are using an unmodified workspace release you will get a purple pill with the version of the workspace you are using.

![release indicator](https://i.postimg.cc/BvHkvfyc/release.png)

If you are using your work branch, with or without an opened merge request, you will get a yellow pill like the one in the image below. If you pass your mouse over the pill, you will get a tooltip with merge request/commit information.

![work branch indicator](https://i.postimg.cc/3xyzPvFq/commited.png)

If you have uncommitted changes you will get a red pill like the one in the following image. You will get a warning and a confirm dialog if you try to sync your workspace when in a "dirty" state, anyway, due to the way Insomnia imports workspaces only coincident resources will be synced, I mean, if you have, for example, a group of requests in your local workspace that are not in the release, the sync operation will not touch them, making hard to lose local work on updates.

![uncommitted changes indicator](https://i.postimg.cc/vZpCMZPZ/dirty.png)

## Intervals
Some plugin functionality is based on periodic execution of code, mainly we are using intervals to check the status of things, there are one interval that checks if the local workspace has changed compared with the remote one, another one checks for new workspace releases, etc. The proper way of installing these intervals is using a hook or event listener for a non-existent Insomnia event, something like PluginLoadedEvent or similar. Due to the lack of this kind of event we are installing intervals when an action menu is called, so until you use the plugin first time in a session, the intervals are not running. This is the only way I found to achieve this, so, with this in mind, maybe you want open the setup dialog every time you open Insomnia.

## Known Bugs
At least there is a known and, at the moment, not resolvable bug. The first time the plugin is configured tries to sync the workspace with the remote repository, after this operation, Insomnia is unable to export the current local workspace correctly, and the resources array is always empty. Because of that, the workspace state indicator always appears red (uncommitted changes), even when there are not changes at all. At the moment we don't have any way to resolve this bug and the only workaround is close and open Insomnia once.

## Notes
This is the result of the first three days of React development in my life, maybe, or almost sure, the code is crap and has bugs and malfunctions. Please, if you find one, open an issue. If you want to improve the code, please open a pull request, all help is welcome.

Be merciful.

