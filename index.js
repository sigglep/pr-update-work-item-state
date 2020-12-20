
const azureDevOpsHandler = require(`azure-devops-node-api`);
const core = require(`@actions/core`);
const github = require(`@actions/github`);
const fetch = require("node-fetch");
global.Headers = fetch.Headers;


main();
async function main () {
  
    const env = process.env
    const context = github.context; 

    let vm = [];

    vm = getValuesFromPayload(github.context.payload,env);

    try {
        var workItemId = await getWorkItemIdFromPrTitleOrBranchName(env);
        await updateWorkItem(workItemId, env);
    } catch (err) {
        console.log(err);
        core.setFailed();
    }
}

async function getWorkItemIdFromPrTitleOrBranchName(env) {
    let h = new Headers();
    let auth = 'token ' + env.gh_token;
    h.append ('Authorization', auth );
    try {   
        if(env.pull_number != undefined && env.pull_number != "") {
            console.log("Getting work item ID from PR title");
            const requestUrl = "https://api.github.com/repos/"+env.ghrepo_owner+"/"+env.ghrepo+"/pulls/"+env.pull_number;
            const response= await fetch (requestUrl, {
                method: 'GET', 
                headers:h
                })
            const result = await response.json();

            var pullRequestTitle = result.title;
            var found = pullRequestTitle.match(/[(0-9)]*/g);
            var workItemId = found[3];
            console.log("WorkItem: " + workItemId);
            return workItemId;
        } else {
            console.log("Getting work item ID from BRANCH name");
            var branchName = env.branch_name;
            var found = branchName.match(/([0-9]+)/g);
            var workItemId = found[0];
            console.log("WorkItem: " + workItemId);
            return workItemId;
        }
    } catch (err){
        core.setFailed(err);
    }
}

async function isOpened(env) {
    let h = new Headers();
    let auth = 'token ' + env.gh_token;
    h.append ('Authorization', auth );
    try {   
        const requestUrl = "https://api.github.com/repos/"+env.ghrepo_owner+"/"+env.ghrepo+"/pulls/"+env.pull_number;    
        const response= await fetch (requestUrl, {
            method: 'GET', 
            headers:h
            })
        const result = await response.json();

        var pullRequestStatus = result.state;
        return pullRequestStatus == "open";
    } catch (err){
        core.setFailed(err);
    }
}

async function isMerged(env) {
    let h = new Headers();
    let auth = 'token ' + env.gh_token;
    h.append ('Authorization', auth );
    const newRequestUrl = "https://api.github.com/repos/"+env.ghrepo_owner+"/"+env.ghrepo+"/pulls/"+env.pull_number+"/merge";    
    const mergeResponse = await fetch (newRequestUrl, {
        method: 'GET', 
        headers:h
    })

    var pullRequestStatus = mergeResponse.status;
    if (pullRequestStatus == "204") {
        return true;
    }

    return false;
}

async function isClosed(env) {
    let h = new Headers();
    let auth = 'token ' + env.gh_token;
    h.append ('Authorization', auth );
    try {   
        const requestUrl = "https://api.github.com/repos/"+env.ghrepo_owner+"/"+env.ghrepo+"/pulls/"+env.pull_number;    
        const response= await fetch (requestUrl, {
            method: 'GET', 
            headers:h
            })
        const result = await response.json();

        var pullRequestStatus = result.state;
        return pullRequestStatus == "closed";
    } catch (err){
        core.setFailed(err);
    }
}

async function updateWorkItem(workItemId, env) {
    let authHandler = azureDevOpsHandler.getPersonalAccessTokenHandler(env.ado_token);
    let connection = new azureDevOpsHandler.WebApi("https://dev.azure.com/" + env.ado_organization, authHandler);
    let client = await connection.getWorkItemTrackingApi();
    var workItem = await client.getWorkItem(workItemId);
    var currentDescription = String (workItem.fields["System.Description"]);
    var currentState = workItem.fields["System.State"];
    var workItemType = workItem.fields["System.WorkItemType"];
    console.log("Work item type: " + workItemType);
    if (workItemType == "Task" || workItemType == "Bug" || workItemType == "Change request") {

        if (currentState == env.closedstate)
        {
            console.log("WorkItem is already closed and cannot be updated anymore.");
            return;
        } else if (currentState == env.propenstate) {
            console.log("WorkItem is already in a state of PR open, will not update.");
            return;
        }
        else {        
            let workItemSaveResult = null;
            let mergeStatus = [];
            let newDescription = [];

            if (await isMerged(env) == true) {
                console.log("PR IS MERGED");
                mergeStatus = "Linked Pull Request merge is successful";
                newDescription = currentDescription + "<br />" + mergeStatus;               
                let patchDocument = [
                    {
                        op: "add",
                        path: "/fields/System.State",
                        value: env.closedstate
                    },
                    {
                        op: "add",
                        path: "/fields/System.Description",
                        value: newDescription
                    }
                ];

                workItemSaveResult = await client.updateWorkItem(
                        (customHeaders = []),
                        (document = patchDocument),
                        (id = workItemId),
                        (project = env.project),
                        (validateOnly = false)
                        );
                console.log("Work Item " + workItemId + " state is updated to " + env.closedstate);         
            } else if (await isOpened(env) == true) {
                try {
                console.log("PR IS OPENED: " + env.propenstate);
                mergeStatus = "Linked new Pull Request to Azure Boards";
                newDescription = currentDescription + "<br />" + mergeStatus;
                let patchDocument = [
                    {
                        op: "add",
                        path: "/fields/System.State",
                        value: env.propenstate
                    },
                    {
                        op: "add",
                        path: "/fields/System.Description",
                        value: newDescription
                    }
                ];

                workItemSaveResult = await client.updateWorkItem(
                        (customHeaders = []),
                        (document = patchDocument),
                        (id = workItemId),
                        (project = env.project),
                        (validateOnly = false)
                        );
                console.log("Work Item " + workItemId + " state is updated to " + env.propenstate);     
                } catch (err) {
                    console.log(err);
                }
            } else if (await isClosed(env) == true) {
                try {
                    console.log("PR IS CLOSED: " + env.inprogressstate);
                    mergeStatus = "Pull request was rejected";
                    newDescription = currentDescription + "<br />" + mergeStatus;
                    let patchDocument = [
                        {
                            op: "add",
                            path: "/fields/System.State",
                            value: env.inprogressstate
                        },
                        {
                            op: "add",
                            path: "/fields/System.Description",
                            value: newDescription
                        }
                    ];
        
                    workItemSaveResult = await client.updateWorkItem(
                            (customHeaders = []),
                            (document = patchDocument),
                            (id = workItemId),
                            (project = env.project),
                            (validateOnly = false)
                            );
                    console.log("Work Item " + workItemId + " state is updated to " + env.inprogressstate);     
                    } catch (err) {
                        console.log(err);
                    }
            } else {
                try {
                    console.log("BRANCH IS OPEN: " + env.inprogressstate);
                    mergeStatus = "Pull request was rejected";
                    newDescription = currentDescription + "<br />" + mergeStatus;
                    let patchDocument = [
                        {
                            op: "add",
                            path: "/fields/System.State",
                            value: env.inprogressstate
                        },
                        {
                            op: "add",
                            path: "/fields/System.Description",
                            value: newDescription
                        }
                    ];
        
                    workItemSaveResult = await client.updateWorkItem(
                            (customHeaders = []),
                            (document = patchDocument),
                            (id = workItemId),
                            (project = env.project),
                            (validateOnly = false)
                            );
                    console.log("Work Item " + workItemId + " state is updated to " + env.inprogressstate);     
                    } catch (err) {
                        console.log(err);
                    }
            }

            return workItemSaveResult;
        }
    }
}

function getValuesFromPayload(payload,env)
{
   var vm = {
        action: payload.action != undefined ? payload.action : "",

        env : {
            organization: env.ado_organization != undefined ? env.ado_organization : "",
            orgurl: env.ado_organization != undefined ? "https://dev.azure.com/" + env.ado_organization : "",
            ado_token: env.ado_token != undefined ? env.ado_token : "",
            project: env.ado_project != undefined ? env.ado_project : "",
            ghrepo_owner: env.gh_repo_owner != undefined ? env.gh_repo_owner :"",
            ghrepo: env.gh_repo != undefined ? env.gh_repo :"",
            pull_number: env.pull_number != undefined ? env.pull_number :"",
            closedstate: env.closedstate != undefined ? env.closedstate :"",
            propenstate: env.propenstate != undefined ? env.propenstate :"",
            inprogressstate: env.inprogressstate != undefined ? env.inprogressstate :"",
            branch_name: env.branch_name != undefined ? env.branch_name :"",
	        gh_token: env.gh_token != undefined ? env.gh_token :""
        }
    }

    return vm;
}



