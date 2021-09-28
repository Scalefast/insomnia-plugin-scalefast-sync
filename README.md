# Gitlab Sync plugin for Insomnia API Client

This plugin for Insomnia aims to ease syncing your workspaces, directories or even single requests to your Git repositories. Right now GitLab is supported.
This plugin is based on [Insomnia Universal Git](https://insomnia.rest/plugins/insomnia-plugin-universal-git) and modified to adapt to Scalefast needs, so if you are not a Scalefast developer probably it doesn't make sense that you use this plugin, and I recommend you to install and use the aforementioned plugin. 

## Installation

Just install it via the [Insomnia Plugin Hub](https://insomnia.rest/plugins) or using the Insomnia plugin interface and using insomnia-plugin-scalefast-sync as npm package to install.


## How to use this plugin

This plugin has two main features, pull workspace from gitlab repository and push workspace changes to gitlab repository.

### Push workspace
Pursuing simplicity and transparency for the user the push flow it as follows, every time the user tries to push changes:
 - The plugin checks for the existence of branch with the form of username_collection_updates, if not found creates it.
 - The plugin checks for an opened merge request from user branch to master, if not found creates it.
 - The plugin commits changes to the configured repository.
 - If the MR is merged/closed, in the next push attempt it will be recreated.
 - If the branch is deleted as a merge result, the plugin will recreate it in the next push attempt.

### Pull workspace
Plugin only pull changes from tags in master branch, so the first time you pull workspace, the plugin gets the most recent
tag, pulls it and update the current workspace with the content in repository. In subsequent pull attempts plugin will only update current workspace if a new tag is released. So, it's mandatory that configured repo has, at least, one tag created. 

After installing just hit the dropdown menu located right beneath the workspace/collections name, go through the setup and start pulling/pushing your config.

![server configuration](https://i.postimg.cc/kgCZDH6c/plugin-menu.png)

## Setup

* Base URL: Your GitLabs' URL.
* Access Token: Create an access token with "api" scope.
* Project ID: Create a new project to store your configs directly in GitLab and enter the project id which you find in the settings.
* Workspace File Name: The file your workspace will be stored under (JSON). Choose this freely.

![server configuration](https://i.postimg.cc/sgJLWJ5R/plugin-setup.png)

