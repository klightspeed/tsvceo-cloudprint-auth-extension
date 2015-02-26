chrome.runtime.onMessage.addListener(function(msg, sender, respond) {
    chrome.identity.getAuthToken({"interactive": true}, function(token) {
        respond({
            "token": token,
            "lasterror": chrome.runtime.lastError
        });
	window.close();
    });
});

