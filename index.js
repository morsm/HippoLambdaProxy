// Forward Smart Home Skill messages to local lambda at amsterdam.termors.net

'use strict';

var https = require("https");
var Promise = require("promise");
var jsonBody = require("body/json");

let AlexaResponse = require("./alexa/AlexaResponse");

// MtM 14-04-2020: Made server uri configurable, not just for LED lambda anymore
// although that's what it defaults to if the environment variable SERVER_URI isn't set
const SERVER_URI = process.env.SERVER_URI || "/hippoledlambda";

exports.handler = async function (event) {

    // Dump the request for logging - check the CloudWatch logs
    console.log("index.handler request  -----");
    console.log(JSON.stringify(event));

    // Validate we have an Alexa directive
    if (!('directive' in event)) {
        let aer = new AlexaResponse(
            {
                "name": "ErrorResponse",
                "payload": {
                    "type": "INVALID_DIRECTIVE",
                    "message": "Missing key: directive, Is request a valid Alexa directive?"
                }
            });
        return sendResponse(aer.get());
    }

    // Check the payload version
    if (event.directive.header.payloadVersion !== "3") {
        let aer = new AlexaResponse(
            {
                "name": "ErrorResponse",
                "payload": {
                    "type": "INTERNAL_ERROR",
                    "message": "This skill only supports Smart Home API version 3"
                }
            });
        return sendResponse(aer.get());
    }

    let namespace = ((event.directive || {}).header || {}).namespace;

    if (namespace.toLowerCase() === 'alexa.authorization') {
        let aar = new AlexaResponse({"namespace": "Alexa.Authorization", "name": "AcceptGrant.Response",});
        return sendResponse(aar.get());
    }
    
    // Any message beyond this, forward to amsterdam.termors.net
    // and send DeferredResponse
    var theToken = namespace.toLowerCase() === 'alexa.discovery' ? event.directive.payload.scope.token : event.directive.endpoint.scope.token;
    var correlationToken = event.directive.header.correlationToken;

    var hippoLambdaBody = {
        header:
        {
            token: theToken   
        },
        payload: event
    };
    var response = new AlexaResponse(
        {
            "name": "ErrorResponse",
            "payload": {
                "type": "INTERNAL_ERROR",
                "message": ""
            }
        });        
    
    try
    {
        response = await hippoHttpPostRequest(SERVER_URI, hippoLambdaBody, theToken);
    }
    catch (err)
    {
        // Response message is already an Alexa error response
        console.log("Error during HTTP post request to Hippotronics", err);
        response.event.payload.message = err;
    }

    // If response is instance of AlexaResponse, convert to string
    if (response instanceof AlexaResponse) response = response.get();

    return sendResponse(response);

};

async function hippoHttpPostRequest(url, body, token)
{
    console.log("Sending POST to HippoLambda ----");
    var bodyTxt = JSON.stringify(body);
    console.log(bodyTxt);
    
    return new Promise( (resolve, reject) =>
    {
        var options = {
            host: "amsterdam.termors.net",
            path: url,
            method: 'POST',
            headers: {
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json",
                "Content-Length": bodyTxt.length
            }
        };
    
        var req = https.request(options, (res) => {
            console.log("Hippotronics responds ", res.statusCode);

            if (200 == res.statusCode) 
            {
                jsonBody(res, function (err, body)
                {
                    if (err) reject(err);
                    resolve(body);
                });
            }
            else 
            {
                var errorMessage = "Http Error: " + res.statusCode + " " + res.statusMessage;
                console.log(errorMessage);
                reject(errorMessage);
            }
        });
        
        req.on('error', (error) => {
            console.log("On Error HTTP Request: " + error);
            reject(error)
        });
        
        req.write(bodyTxt);
        req.end();
    });
}

function sendResponse(response)
{
    // TODO Validate the response
    console.log("index.handler response -----");
    console.log(JSON.stringify(response));
    return response;
}

