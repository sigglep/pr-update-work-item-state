
const azureDevOpsHandler = require(`azure-devops-node-api`);
const core = require(`@actions/core`);
const github = require(`@actions/github`);
const fetch = require("node-fetch");
global.Headers = fetch.Headers;


main();
function main () {
  
    const env = process.env
    const context = github.context; 

    let vm = [];

    vm = getValuesFromPayload(github.context.payload,env);
    console.log(vm);

   if(vm.action == "closed") //opened - opened / closed + merged == true - merged / closed - closed
   {
       var workItemId = getWorkItemIdFromPrTitle(env);
       updateWorkItem(workItemId, env);
   } else if (vm.action == "opened") {
        var workItemId = getWorkItemIdFromPrTitle(env);
        updateWorkItem(workItemId, env);
   } else {
        core.setFailed();
   }
}

async function getWorkItemIdFromPrTitle(env) {
    let h = new Headers();
    let auth = 'token ' + env.gh_token;
    h.append ('Authorization', auth );
    try {   
        const requestUrl = "https://api.github.com/repos/"+env.ghrepo_owner+"/"+env.ghrepo+"/pulls/"+env.pull_number;
        console.log("getWorkItemIdFromPrTitle request URL: " + requestUrl);
        const response= await fetch (requestUrl, {
            method: 'GET', 
            headers:h
            })
        const result = await response.json();

        var pullRequestTitle = result.title;
        var found = pullRequestTitle.match(/[0-9]*/g);
        console.log("REGEX: " + found)
        var workItemId = found[0];
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

async function updateWorkItem(workItemId, env) {
    let authHandler = azureDevOpsHandler.getPersonalAccessTokenHandler(env.adoToken);
    let connection = new azureDevOpsHandler.WebApi("https://dev.azure.com/" + env.ado_organization, authHandler);
    let client = await connection.getWorkItemTrackingApi();
    var workItem = await client.getWorkItem(workItemId);
    var currentDescription = String (workItem.fields["System.Description"]);
    var currentState = workItem.fields["System.State"];

    var type = await client.getWorkItemType(env.project,String (workItem.fields["System.WorkItemType"]));

    if (currentState == env.closedstate)
    {
        console.log("WorkItem is already closed and cannot be updated anymore.");
        core.setFailed();
    } else {        
        let workItemSaveResult = null;
        let mergeStatus = [];
        let newDescription = [];

        if (isMerged(env) == true){
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
        } else if (isOpened(env) == true) {
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
            adoToken: env.ado_token != undefined ? env.ado_token : "",
            project: env.ado_project != undefined ? env.ado_project : "",
            ghrepo_owner: env.gh_repo_owner != undefined ? env.gh_repo_owner :"",
            ghrepo: env.gh_repo != undefined ? env.gh_repo :"",
            pull_number: env.pull_number != undefined ? env.pull_number :"",
            closedstate: env.closedstate != undefined ? env.closedstate :"",
            propenstate: env.propenstate != undefined ? env.propenstate :"",
	        gh_token: env.gh_token != undefined ? env.gh_token :""
        }
    }

    return vm;
}



