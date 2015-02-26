var authInProgress = false;
var authTabId = null;

function authServerNotify(authserver) {
    chrome.notifications.create(
        "tsvceo-cloudprint-auth_authserver_visit",
        {
            type: "basic",
            title: "CloudPrint Server",
            message: "Please click here to go to cloud print server.",
            priority: 1,
            iconUrl: "icon128.png",
            isClickable: true
        },
        function(id) {
            chrome.notifications.onClicked.addListener(function noteClicked(nid) {
                if (nid == id) {
                    chrome.tabs.create({ "url": authserver, "active": true }, function(tab) {});
                    chrome.notifications.onClicked.removeListener(noteClicked);
                }
            });
        }
    );
}

function openAuthServerTab(authserver, username) {
    chrome.tabs.create({ "url": authserver + "/Login?username=" + encodeURIComponent(username), "active": true }, function(tab) {});
}

function authServerLoginRequired(authserver, username, jobswaiting) {
    chrome.notifications.create(
        "tsvceo-cloudprint-auth_authserver_login",
        {
            type: "basic",
            title: "CloudPrint Server",
            message: "Please click here to enable cloud printing." + (jobswaiting ? ("\n\nYou have " + jobswaiting + " jobs waiting.") : ""),
            priority: 1,
            iconUrl: "icon128.png",
            isClickable: true
        },
        function(id) {
            chrome.notifications.onClicked.addListener(function noteClicked(nid) {
                if (nid == id) {
                    openAuthServerTab(authserver, username);
                    chrome.notifications.onClicked.removeListener(noteClicked);
                }
            });
        }
    );
}

function checkAuthServerLogin(authserver, username) {
    console.log("Requesting user login status for " + username + " from " + authserver);
    var xhr = new XMLHttpRequest();
    xhr.open("GET", authserver + "/UserStatus?username=" + encodeURIComponent(username));

    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            if (xhr.status == 200 && xhr.response) {
                var response = xhr.response;

                if (response.isauthenticated) {
                    console.log("User is already authenticated with server");

                    chrome.notifications.create(
                        "tsvceo-cloudprint-auth_printsubmit",
                        {
                            type: "basic",
                            title: "Print Job Submitted",
                            message: "Your print job has been sent to the print server.",
                            priority: 1,
                            iconUrl: "icon128.png"
                        },
                        function(id) {}
                    );
                } else {
                    console.log("User needs to authenticate with server");
                    authServerLoginRequired(authserver, username, response.jobswaiting);
                }
            } else {
                console.log("Server does not support /UserStatus endpoint");
                authServerNotify(authserver);
            }
        }
    }

    xhr.responseType = "json";
    xhr.send();
}

function getServerForPrinter(printer, username) {
    console.log("Getting server for printer " + printer + "; username=" + username);
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "https://tsvceo-cloudprint-authreg.appspot.com/query?printerid=" + encodeURIComponent(printer));

    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4 && xhr.status == 200) {
            var response = xhr.response;
            
            if (response && response.authserver) {
                checkAuthServerLogin(response.authserver, username);
            }
        }
    }

    xhr.responseType = "json";
    xhr.send();
}

function doGetPrintJobs(token) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "https://www.google.com/cloudprint/jobs");
    
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4 && xhr.status == 200) {
            var printers = {};
            var printerlist = [];
            var response = xhr.response;

            if (response && response.jobs) {
                var ownerid = null;

                for (i in response.jobs) {
                    printers[response.jobs[i].printerid] = 0;
                    ownerid = response.jobs[i].ownerId;
                }

                var username = ownerid.substr(0, ownerid.indexOf("@"));

                for (printer in printers) {
                    getServerForPrinter(printer, username);
                    break;
                }
            }
        }
    }

    xhr.setRequestHeader("Authorization", "OAuth " + token);
    xhr.responseType = "json";
    xhr.send();
}

function getPrintJobsAuthInteractive() {
    authInProgress = true;
    
    chrome.tabs.create({ "url": "auth.html", "active": false }, function(tab) {
        authTabId = tab.id;

        chrome.tabs.onUpdated.addListener(function authTabUpdated(tabid, change, tab) {
            if (tabid == authTabId && change.status == "complete") {
                chrome.tabs.sendMessage(tabid, "", function(response) {
                    authTabId = null;

                    //chrome.tabs.remove(tabid);

                    if (!response.token) {
                        console.log(response.lasterror);
                    } else {
                        console.log("Got auth interactively");
                        doGetPrintJobs(response.token);
                    }

                    authInProgress = false;

                    chrome.tabs.onUpdated.removeListener(authTabUpdated);
                });
            }
        });
    });
}

function getPrintJobs(interactive) {
    chrome.identity.getAuthToken({"interactive": false}, function(token) {
        if (!token) {
            console.log(chrome.runtime.lastError);
            
            if (interactive && !authInProgress) {
                getPrintJobsAuthInteractive();
            }
        } else {
            doGetPrintJobs(token);
        }
    });
}

chrome.webRequest.onCompleted.addListener(
    function(details) {
        if (details.method == "POST") {
            getPrintJobs(true);
        }
    },
    {
        urls: [
            "*://*.google.com/cloudprint/submit*"
        ]
    }
);

