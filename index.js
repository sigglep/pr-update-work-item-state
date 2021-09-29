
const azureDevOpsHandler = require(`azure-devops-node-api`);
const core = require(`@actions/core`);
const github = require(`@actions/github`);
const fetch = require("node-fetch");
const version = "1.0.7"
global.Headers = fetch.Headers;


main();
async function main () {
    console.log("VERSION " + version);
	
    const env = process.env
    const context = github.context; 
    let vm = getValuesFromPayload(github.context.payload,env);
	
	if (env.branch_name.includes("master")){
		console.log("Selected check doesn't work for master branch");
		return;
	}
	else if (env.branch_name.includes("bot")){
		console.log("Checks are not being done for bot branches");
		return;
	}
	else if (env.branch_name.includes("release") ||
	    env.branch_name.includes("task") ||
	    env.branch_name.includes("bug") ||
	    env.branch_name.includes("change-request") ||
	    env.branch_name.includes("refs/pull"))
	{
	    try {
		var workItemId = "";
		workItemId = await getWorkItemIdFromPrTitleOrBranchName(env);
		await updateWorkItem(workItemId, env);
	    } catch (err) {
		core.setFailed(err);
	    }
	}
	else {
		core.setFailed("Wrong branch name detected (" + env.branch_name + "), please rename the branch to contain work item ID");
	}
}

function getRequestHeaders(){
	let h = new Headers();
	let auth = 'token ' + env.gh_token;
	h.append('Authorization', auth);
	return h;
}

async function getAzureDevOpsClient(env){
	let authHandler = azureDevOpsHandler.getPersonalAccessTokenHandler(env.ado_token);
	let connection = new azureDevOpsHandler.WebApi("https://dev.azure.com/" + env.ado_organization, authHandler);
	let client = await connection.getWorkItemTrackingApi();
	return client;
}

async function getWorkItemIdFromPrTitle(env) {
	try {
		console.log("Getting work item iD from PR title");
		const requestUrl = "https://api.github.com/repos/"+env.ghrepo_owner+"/"+env.ghrepo+"/pulls/"+env.pull_number;
		
		const response = await fetch(requestUrl, {
			method: 'GET',
			headers: getRequestHeaders()
		});
		const result = await response.json();
		
		var pullRequestTitle = result.title;
		console.log("PR title: " + pullRequestTitle);
		
		try {
			var foundMatches = pullRequestTitle.match(/[(0-9)]*/g);
			var workItemId = foundMatches[3];
			console.log("Work item ID: " + workItemId);
			return workItemId;
		} catch (err) {
			core.setFailed("Wrong PR name detected");
		}
	} catch (err) {
		core.setFailed(err);
	}
}

function getWorkItemIdFromBranchName(env) {
	var branchName = env.branch_name;
	try {
		var foundMatches = branchName.match(/([0-9]+)/g);
		var workItemId = foundMatches[0];
		console.log("Work item ID: " + workItemId);
		return workItemId
	} catch (err) {
		core.setFailed("Wrong Branch name detected");
	}
}

async function getWorkItemIdFromPrTitleOrBranchName(env) {
	if(env.pull_number != undefined && env.pull_number != "") {
	    console.log("Getting work item ID from PR title");
	    return await getWorkItemIdFromPrTitle(env);
	} else {
	    console.log("Getting work item ID from BRANCH name");
	    return getWorkItemIdFromBranchName(env);
	}
}

async function isOpened(env) {
    try {   
        const requestUrl = "https://api.github.com/repos/"+env.ghrepo_owner+"/"+env.ghrepo+"/pulls/"+env.pull_number;    
        const response = await fetch (requestUrl, {
            method: 'GET', 
            headers: getRequestHeaders()
            })
        const result = await response.json();

        var pullRequestStatus = result.state;
        return pullRequestStatus == "open";
    } catch (err){
        core.setFailed(err);
    }
}

async function isMerged(env) {
	try {
		const newRequestUrl = "https://api.github.com/repos/"+env.ghrepo_owner+"/"+env.ghrepo+"/pulls/"+env.pull_number+"/merge";    
		const mergeResponse = await fetch (newRequestUrl, {
			method: 'GET', 
			headers: getRequestHeaders()
		})

		var pullRequestStatus = mergeResponse.status;
		if (pullRequestStatus == "204") {
			return true;
		}

		return false;
	} catch (err) {
		core.setFailed(err);
	}
}

async function isClosed(env) {
    try {   
        const requestUrl = "https://api.github.com/repos/"+env.ghrepo_owner+"/"+env.ghrepo+"/pulls/"+env.pull_number;    
        const response= await fetch (requestUrl, {
            method: 'GET', 
            headers: getRequestHeaders()
            })
        const result = await response.json();

        var pullRequestStatus = result.state;
        return pullRequestStatus == "closed";
    } catch (err){
        core.setFailed(err);
    }
}

async function handleMergedPr(workItemId, env) {
	let client = getAzureDevOpsClient(env);
	
	let patchDocument = [
		{
			op: "add",
			path: "/fields/System.State",
			value: env.closedstate
		}
	];
	
	let workItemSaveResult = await client.updateWorkItem(
		(customHeaders = []),
		(document = patchDocument),
		(id = workItemId),
		(project = env.project),
		(validateOnly = false)
		);
}

async function handleOpenedPr(workItemId, env) {
	let client = getAzureDevOpsClient(env);
	
	let patchDocument = [
		{
			op: "add",
			path: "/fields/System.State",
			value: env.propenstate
		}
	];
	
	let workItemSaveResult = await client.updateWorkItem(
		(customHeaders = []),
		(document = patchDocument),
		(id = workItemId),
		(project = env.project),
		(validateOnly = false)
		);
}

async function handleClosedPr(workItemId, env) {
	let client = getAzureDevOpsClient(env);
	
	let patchDocument = [
		{
			op: "add",
			path: "/fields/System.State",
			value: env.inprogressstate
		}
	];
	
	let workItemSaveResult = await client.updateWorkItem(
		(customHeaders = []),
		(document = patchDocument),
		(id = workItemId),
		(project = env.project),
		(validateOnly = false)
		);	
}

async function handleOpenBranch(workItemId, env){
	let client = getAzureDevOpsClient(env);
	
	let patchDocument = [
		{
			op: "add",
			path: "/fields/System.State",
			value: env.inprogressstate
		}
	];
	
	let workItemSaveResult = await client.updateWorkItem(
		(customHeaders = []),
		(document = patchDocument),
		(id = workItemId),
		(project = env.project),
		(validateOnly = false)
		);	
}

async function updateWorkItem(workItemId, env) {
	let client = await getAzureDevOpsClient(env);
	var workItem = await client.getWorkItem(workItemId);
	
	if (workItem.fields["System.State"] == env.closedstate)
	{
	    console.log("WorkItem is already closed and cannot be updated anymore.");
	    return;
	} else if (workItem.fields["System.State"] == env.propenstate && await isMerged(env) == false) {
	    console.log("WorkItem is already in a state of PR open, will not update.");
	    return;
	}
	else {        
	    if (await isMerged(env) == true) {
		console.log("PR IS MERGED");
		await handleMergedPr(workItemId, env);  
	    } else if (await isOpened(env) == true) {
		console.log("PR IS OPENED: " + env.propenstate);
		await handleOpenedPr(workItemId, env);
	    } else if (await isClosed(env) == true) {
		console.log("PR IS CLOSED: " + env.inprogressstate);
		await handleClosedPr(env)
	    } else {
		console.log("BRANCH IS OPEN: " + env.inprogressstate);
		await handleOpenBranch(env);
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



