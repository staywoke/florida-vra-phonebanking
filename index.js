'use strict';

var AWS = require('aws-sdk');
AWS.config.region = 'us-east-1';
var s3 = new AWS.S3({region: 'us-east-1'});
var http = require('http');
var twilio = require('twilio');
var VoiceResponse = twilio.twiml.VoiceResponse;
var index = 0; 
var idsToCall;
var callList = [];
var residentMap = {};
var fromToMap = {};

var greeting = "Hi ";
var callScript =", I'm [Your Name] with StayWoke. 1.6 million people in Florida are currently " + 
"banned from voting because of a past conviction. We need signed petitions from registered " + 
"voters in your county to give them their rights back. Will you help? \n" + 
"[If YES]: Go to florida.ourstates.org and download the petition, " + 
"then sign it and mail it into Floridians for a Fair Democracy at the address in the " + 
"bottom right corner of the page. You also might have already received the petition in the mail, " + 
"to make things easier. Can we count on you to sign and send back the petition so 1.6 million people " + 
"can regain their rights? \n" +   
"[IF NO]: then say 'Thank you anyway, have a nice day!"; 


var filterResidents = function(){
    idsToCall = [];
    for (var i = 0, len = callList.length; i < len; i++){
        if( /yes/gi.test(callList[i].committedToAction) || /wrong number/gi.test(callList[i].notes) || /no/gi.test(callList[i].committedToAction)) {
            continue;
        }
        residentMap[callList[i].id] = callList[i];
        idsToCall.push(callList[i].id);
    }

    return idsToCall;
};


var server = http.createServer(function(req, res){
    
    if (req.method === 'POST') {
        var body = '';

        req.on('data', function(chunk) {
            body += chunk;
        });
        
        req.on('error', function(e){
            console.log('e', e);
        });

        req.on('end', function() {
            if (req.url === '/initiatePhoneBank') {         
                var callerResponse1 = new VoiceResponse();
                var gather1 = callerResponse1.gather({
                    numDigits: 1,
                    action: '/callFloridianVoter',
                    method: 'POST'
                });
                gather1.say(
                    'Thank you for phonebanking for Florida\'s voting restoration amendment! ' + 
                    'In a second you will be forwarded to a registered voter in Florida and be texted ' + 
                    'a call script with the voter\'s name. ' + 
                    'Please press 1 now to be forwarded. '
                );

                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.write(callerResponse1.toString());
                res.end();
            }

            else if (req.url === '/callFloridianVoter'){
                var nextResidentId = idsToCall[index++];
                if (!nextResidentId){
                    index = 0; 
                    idsToCall = filterResidents();
                    idsToCall = [];
                    if (!idsToCall || !idsToCall.length){
                        var endCallResponse = new VoiceResponse();
                        endCallResponse.say(
                            'Phonebanking for the Florida Voting Restoration Amendment has ended. ' +
                            'Thanking you for your hard work. Goodbye' 
                        );
                        endCallResponse.hangup();
                        res.writeHead(200, { 'Content-Type': 'text/xml' });
                        res.write(endCallResponse.toString());
                        res.end();
                        return;
                    }

                    nextResidentId= idsToCall[index++];
                }
                var nextResident = residentMap[nextResidentId];
                var from = body.split('&').find(function(data){
                    return /From/g.test(data);
                });
                from = decodeURIComponent(from).split('=')[1];
                fromToMap[from] = nextResident.id;
                
                var client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                client.messages.create({
                    to: from,
                    from: '+16787374787',
                    body: (greeting + nextResident.fullName +  callScript),
                });
                
                var callerResponse2 = new VoiceResponse();
                callerResponse2.say('Connecting you to ' + nextResident.fullName + '. Please remain on the line once the resident ends the call to report how it went.');
                callerResponse2.dial(nextResident.number, {
                    action: '/reportVoterResponse', 
                    method: 'POST'
                });

                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.write(callerResponse2.toString());
                res.end();
            } 

            else if (req.url === '/reportVoterResponse'){
                var callerResponse3 = new VoiceResponse();
                var gather2 = callerResponse3.gather({
                    numDigits: 1,
                    action: '/done', 
                    method: 'POST'
                });
                gather2.say(
                    "Thank you for phonebanking for Florida's voting restoration amendment! " + 
                    "Please press 1 if the resident has agreed to sign and mail the petition. " + 
                    "Press 2 if you believe this is a wrong number. " + 
                    "Press 3 if the resident did not agree to sign and mail the petition. " + 
                    "Press 4 if you did not reach the resident. " 
                );
                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.write(callerResponse3.toString());
                res.end();
            } 

            else if (req.url === '/done'){
                var digitProvided = body.split('&').find(function(data){
                    return /Digit/g.test(data);
                });

                if (digitProvided){
                    digitProvided = decodeURIComponent(digitProvided).split('=')[1];
                    digitProvided = Number(digitProvided);

                    var from = body.split('&').find(function(data){
                        return /From/g.test(data);
                    });

                    from = decodeURIComponent(from).split('=')[1];

                    var residentId = fromToMap[from];
                    var residentToUpdate = residentMap[residentId];
                    if (digitProvided === 1){                
                        residentToUpdate.committedToAction = 'YES'; 
                    }
                    else if (digitProvided === 2){
                        residentToUpdate.notes = 'wrong number';
                    }
                    else if (digitProvided === 3){
                        residentToUpdate.committedToAction = 'NO'; 
                    }
                    else if (digitProvided === 4){
                        residentToUpdate.notes = 'vm - call back'; 
                    }

                    residentToUpdate.lastContacted = new Date().toISOString();
                    residentToUpdate.lastContactedBy = from;
                    console.log('\n\n\n residentToUpdate ', residentToUpdate);
                }

                var callerResponse4 = new VoiceResponse();
                callerResponse4.say(
                    "Thank you for phonebanking for the voting restoration amendment! " +
                    "Please spread the word to everyone you know. Together we will win."
                );
                callerResponse4.hangup();
                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.write(callerResponse4.toString());
                res.end();
            } 
        });
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end();
    }
});


var init = function(callback){
    s3.getObject({ Bucket: 'florida-vra', Key: 'callList.json' }, function(e, data){
        if (e){
            return callback(e);
        }
        try {
            data = JSON.parse(data.Body.toString()); 
        }
        catch(e){
            return callback(e);
        }

        callback(null, data);
    });
};

var save = function(){
    if (!Array.isArray(callList)){
        return;
    }
    s3.putObject({ Bucket: 'florida-vra', Key: 'callList.json', Body: JSON.stringify(callList), CacheControl: 'no-cache,no-store'}, function(e){
        if (e){
            console.log('saving the callList failed: ', e);
        }
    });
};


init(function(e, data){
    if (e){
        return;
    }
    callList = data;
    idsToCall = filterResidents();
    server.listen(process.env.PORT || 3000);
    setInterval(save, 600000);
});



































