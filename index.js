
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
    console.log(vm);
    console.log("Branch name: " + env.branch_name);

    try {
        try{
            await processPr(env);
        } catch {
            await processBranch(env);
        }
    } catch (err) {
        console.log(err);
        core.setFailed();
    }
}

async function processPr(env){
    var workItemId = await getWorkItemIdFromPrTitle(env);
    await updateWorkItem(workItemId, env);
}

async function processBranch(env) {
    var workItemId = await getWorkItemFromBranchName(env);
    await updateWorkItem(workItemId, env);
}

async function getWorkItemIdFromPrTitle(env) {
    let h = new Headers();
    let auth = 'token ' + env.gh_token;
    h.append ('Authorization', auth );
    console.log('Authorization ' + auth);
    try {   
        const requestUrl = "https://api.github.com/repos/"+env.ghrepo_owner+"/"+env.ghrepo+"/pulls/"+env.pull_number;
        console.log("getWorkItemIdFromPrTitle request URL: " + requestUrl);
        const response= await fetch (requestUrl, {
            method: 'GET', 
            headers:h
            })
        const result = await response.json();

        var pullRequestTitle = result.title;
        var found = pullRequestTitle.match(/[(0-9)]*/g);
        console.log("REGEX: " + found);
        var workItemId = found[3];
        console.log("WorkItem: " + workItemId);
        return workItemId;
    } catch (err){
        core.setFailed(err);
    }
}

async function getWorkItemFromBranchName(env) {
    let h = new Headers();
    let auth = 'token ' + env.gh_token;
    h.append ('Authorization', auth );
    console.log('Authorization ' + auth);
    try {   
        var branchName = env.branch_name;
        var found = branchName.match(/([0-9]+)/g);
        console.log("REGEX: " + found);
        var workItemId = found[0];
        console.log("WorkItem: " + workItemId);
        return workItemId;
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
        console.log("Current state: " + pullRequestStatus);
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
    console.log("ADO Token: " + env.ado_token);
    let authHandler = azureDevOpsHandler.getPersonalAccessTokenHandler(env.ado_token);
    console.log("ADO URL: " + "https://dev.azure.com/" + env.ado_organization);
    let connection = new azureDevOpsHandler.WebApi("https://dev.azure.com/" + env.ado_organization, authHandler);
    let client = await connection.getWorkItemTrackingApi();
    console.log("ADO WorkItemId: " + workItemId);
    var workItem = await client.getWorkItem(workItemId);
    var currentDescription = String (workItem.fields["System.Description"]);
    var currentState = workItem.fields["System.State"];

    if (currentState == env.closedstate)
    {
        console.log("WorkItem is already closed and cannot be updated anymore.");
        core.setFailed();
    } else {        
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
                console.log("Work Item " + workItemId + " state is updated to " + env.propenstate);     
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
                console.log("Work Item " + workItemId + " state is updated to " + env.propenstate);     
                } catch (err) {
                    console.log(err);
                }
        }

        return workItemSaveResult;
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



