
const azureDevOpsHandler = require(`azure-devops-node-api`);
const core = require(`@actions/core`);
const github = require(`@actions/github`);
const fetch = require("node-fetch");
const version = "1.0.23"
global.Headers = fetch.Headers;


main();
async function main () {
    console.log("VERSION " + version);
	
    const context = github.context; 
    let vm = getValuesFromPayload(github.context.payload);
	
	if (process.env.branch_name.includes("master")){
		console.log("Selected check doesn't work for master branch");
		return;
	}
	else if (process.env.branch_name.includes("code-cleanup") ||
		 process.env.branch_name.includes("swagger-update") ||
		 process.env.branch_name.includes("bot")){
	    console.log("Checks are not being done for bot branches");
	    return;
	}
	else if (process.env.branch_name.includes("release") ||
	    process.env.branch_name.includes("task") ||
	    process.env.branch_name.includes("bug") ||
	    process.env.branch_name.includes("change-request") ||
	    process.env.branch_name.includes("refs/pull"))
	{
	    try {
		var prTitle = await getPrTitle();
		if (typeof(prTitle) != typeof(undefined) && (
		    	prTitle.includes("Code cleanup") ||
		    	prTitle.includes("Swagger update"))) {
			console.log("Bot branches are not being checked towards Azure Boards");
			return;
		}
		    
		var workItemId = "";
		var workItemId = await getWorkItemIdFromPrTitleOrBranchName();
		await updateWorkItem(workItemId);
		console.log("Work item " + workItemId + " was updated successfully");
	    } catch (err) {
		core.setFailed(err.toString());
	    }
	}
	else {
		core.setFailed("Wrong branch name detected (" + process.env.branch_name + "), please rename the branch to contain work item ID");
	}
}

function getRequestHeaders(){
	let h = new Headers();
	let auth = 'token ' + process.env.gh_token;
	h.append('Authorization', auth);
	return h;
}

async function getPrTitle() {
	try {
		console.log("Getting PR title");
		const requestUrl = "https://api.github.com/repos/"+process.env.ghrepo_owner+"/"+process.env.ghrepo+"/pulls/"+process.env.pull_number;
		
		const response = await fetch(requestUrl, {
			method: 'GET',
			headers: getRequestHeaders()
		});
		const result = await response.json();
		
		try {
			return result.title;
		} catch (err) {
			return "";
		}
	} catch (err) {
		core.setFailed(err.toString());
	}
}

async function getWorkItemIdFromPrTitle() {
	try {
		console.log("Getting work item ID from PR title");
		const requestUrl = "https://api.github.com/repos/"+process.env.ghrepo_owner+"/"+process.env.ghrepo+"/pulls/"+process.env.pull_number;
		
		const response = await fetch(requestUrl, {
			method: 'GET',
			headers: getRequestHeaders()
		});
		const result = await response.json();
		
		var pullRequestTitle = result.title;
		
		try {
			var foundMatches = pullRequestTitle.match(/[(0-9)]*/g);
			var workItemId = foundMatches[3];
			console.log("Work item ID: " + workItemId);
			return workItemId;
		} catch (err) {
			core.setFailed("Wrong PR name detected");
		}
	} catch (err) {
		core.setFailed(err.toString());
	}
}

function getWorkItemIdFromBranchName() {
	var branchName = process.env.branch_name;
	try {
		var foundMatches = branchName.match(/([0-9]+)/g);
		var workItemId = foundMatches[0];
		console.log("Work item ID: " + workItemId);
		return workItemId
	} catch (err) {
		core.setFailed("Wrong Branch name detected");
	}
}

async function getWorkItemIdFromPrTitleOrBranchName() {
	if(process.env.pull_number != undefined && process.env.pull_number != "") {
	    console.log("Getting work item ID from PR title");
	    return await getWorkItemIdFromPrTitle();
	} else {
	    console.log("Getting work item ID from BRANCH name");
	    return getWorkItemIdFromBranchName();
	}
}

async function isOpened() {
    try {   
        const requestUrl = "https://api.github.com/repos/"+process.env.ghrepo_owner+"/"+process.env.ghrepo+"/pulls/"+process.env.pull_number;    
        const response = await fetch (requestUrl, {
            method: 'GET', 
            headers: getRequestHeaders()
            })
        const result = await response.json();

        var pullRequestStatus = result.state;
        return pullRequestStatus == "open";
    } catch (err){
        core.setFailed(err.toString());
    }
}

async function isMerged() {
	try {
		const newRequestUrl = "https://api.github.com/repos/"+process.env.ghrepo_owner+"/"+process.env.ghrepo+"/pulls/"+process.env.pull_number+"/merge";    
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
		core.setFailed(err.toString());
	}
}

async function isClosed() {
    try {   
        const requestUrl = "https://api.github.com/repos/"+process.env.ghrepo_owner+"/"+process.env.ghrepo+"/pulls/"+process.env.pull_number;    
        const response= await fetch (requestUrl, {
            method: 'GET', 
            headers: getRequestHeaders()
            })
        const result = await response.json();

        var pullRequestStatus = result.state;
        return pullRequestStatus == "closed";
    } catch (err){
        core.setFailed(err.toString());
    }
}

async function handleMergedPr(workItemId) {
	let authHandler = azureDevOpsHandler.getPersonalAccessTokenHandler(process.env.ado_token);
	let connection = new azureDevOpsHandler.WebApi("https://dev.azure.com/" + process.env.ado_organization, authHandler);
	let client = await connection.getWorkItemTrackingApi();
	
	let patchDocument = [
		{
			op: "add",
			path: "/fields/System.State",
			value: process.env.closedstate
		}
	];
	
	await client.updateWorkItem(
		(customHeaders = []),
		(document = patchDocument),
		(id = workItemId),
		(project = process.env.project),
		(validateOnly = false)
		);
}

async function handleOpenedPr(workItemId) {
	let authHandler = azureDevOpsHandler.getPersonalAccessTokenHandler(process.env.ado_token);
	let connection = new azureDevOpsHandler.WebApi("https://dev.azure.com/" + process.env.ado_organization, authHandler);
	let client = await connection.getWorkItemTrackingApi();
	
	let patchDocument = [
		{
			op: "add",
			path: "/fields/System.State",
			value: process.env.propenstate
		}
	];
	
	await client.updateWorkItem(
		(customHeaders = []),
		(document = patchDocument),
		(id = workItemId),
		(project = process.env.project),
		(validateOnly = false)
		);
}

async function handleClosedPr(workItemId) {
	let authHandler = azureDevOpsHandler.getPersonalAccessTokenHandler(process.env.ado_token);
	let connection = new azureDevOpsHandler.WebApi("https://dev.azure.com/" + process.env.ado_organization, authHandler);
	let client = await connection.getWorkItemTrackingApi();
	
	let patchDocument = [
		{
			op: "add",
			path: "/fields/System.State",
			value: process.env.inprogressstate
		}
	];
	
	await client.updateWorkItem(
		(customHeaders = []),
		(document = patchDocument),
		(id = workItemId),
		(project = process.env.project),
		(validateOnly = false)
		);	
}

async function handleOpenBranch(workItemId){
	let authHandler = azureDevOpsHandler.getPersonalAccessTokenHandler(process.env.ado_token);
	let connection = new azureDevOpsHandler.WebApi("https://dev.azure.com/" + process.env.ado_organization, authHandler);
	let client = await connection.getWorkItemTrackingApi();
	
	let patchDocument = [
		{
			op: "add",
			path: "/fields/System.State",
			value: process.env.inprogressstate
		}
	];
	
	await client.updateWorkItem(
		(customHeaders = []),
		(document = patchDocument),
		(id = workItemId),
		(project = process.env.project),
		(validateOnly = false)
		);	
}

async function updateWorkItem(workItemId) {
	let authHandler = azureDevOpsHandler.getPersonalAccessTokenHandler(process.env.ado_token);
	let connection = new azureDevOpsHandler.WebApi("https://dev.azure.com/" + process.env.ado_organization, authHandler);
	let client = await connection.getWorkItemTrackingApi();
	var workItem = await client.getWorkItem(workItemId);
	
	if (workItem.fields["System.State"] == process.env.closedstate)
	{
	    console.log("WorkItem is already closed and cannot be updated anymore.");
	    return;
	} else if (workItem.fields["System.State"] == process.env.propenstate && await isMerged() == false) {
	    console.log("WorkItem is already in a state of PR open, will not update.");
	    return;
	}
	else {        
	    if (await isMerged() == true) {
		console.log("PR IS MERGED");
		await handleMergedPr(workItemId);  
	    } else if (await isOpened() == true) {
		console.log("PR IS OPENED: " + process.env.propenstate);
		await handleOpenedPr(workItemId);
	    } else if (await isClosed() == true) {
		console.log("PR IS CLOSED: " + process.env.inprogressstate);
		await handleClosedPr(workItemId)
	    } else {
		console.log("BRANCH IS OPEN: " + process.env.inprogressstate);
		await handleOpenBranch(workItemId);
	    }
	}
}

function getValuesFromPayload(payload)
{
   var vm = {
        action: payload.action != undefined ? payload.action : "",

        env : {
            organization: process.env.ado_organization != undefined ? process.env.ado_organization : "",
            orgurl: process.env.ado_organization != undefined ? "https://dev.azure.com/" + process.env.ado_organization : "",
            ado_token: process.env.ado_token != undefined ? process.env.ado_token : "",
            project: process.env.ado_project != undefined ? process.env.ado_project : "",
            ghrepo_owner: process.env.gh_repo_owner != undefined ? process.env.gh_repo_owner :"",
            ghrepo: process.env.gh_repo != undefined ? process.env.gh_repo :"",
            pull_number: process.env.pull_number != undefined ? process.env.pull_number :"",
            closedstate: process.env.closedstate != undefined ? process.env.closedstate :"",
            propenstate: process.env.propenstate != undefined ? process.env.propenstate :"",
            inprogressstate: process.env.inprogressstate != undefined ? process.env.inprogressstate :"",
            branch_name: process.env.branch_name != undefined ? process.env.branch_name :"",
	        gh_token: process.env.gh_token != undefined ? process.env.gh_token :""
        }
    }

    return vm;
}



