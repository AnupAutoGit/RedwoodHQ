/*
Add ability to trigger test executions with a URL
(eg, http://auto-poc01d:8080/executions?testURL=xxxx&Project=Microservices&user=hkirk&pullLatest=false)

node CIExecution.js  --name "Amazon Shopping" --user admin --testset "Amazon Shopping" --machines "127.0.0.1" --pullLatest false --retryCount 1 --project Sample --ignoreScreenshots true

http://localhost:3000/api/remoteexecution/startexecution?name=Amazon%20Shopping&user=admin&testset=Amazon%20Shopping&machines=127.0.0.1&pullLatest=false&retryCount=1&project=Sample&ignoreScreenshots=false&uiSnapshots=true&sendEmail=true&emails=xyz@com
http header
http body: { user=admin,
            testset=Amazon Shopping,
            machines=127.0.0.1&pullLatest=false&retryCount=1&project=Sample&ignoreScreenshots=true ....

*/
var common = require('../common');
var app = require('../common');
var xml = require('xml-writer');
var fs = require('fs');
var db;
var ObjectID = require('mongodb').ObjectID;
var http = require("http");
//var elk = require("./elk");
var execs = require('./executions');

common.initLogger("remoteexecution");
common.parseConfig(function(){

});

function _sendStatus(finalResponse, exitDetails) {
    console.log("_sendStatus start ----- ")
    var statusCode = (!exitDetails || exitDetails.statusCode === 0) ? 200 : exitDetails.statusCode;
    console.log("statuscode " + statusCode);
    if(statusCode !== 200){
        if(exitDetails.executionId) {
            console.log("REMOVING invalid execution records ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~")
            db.collection('executions', function(err, collection) {
                console.log("EXECUTION ID: " + exitDetails.executionId)
                collection.findOne({_id:exitDetails.executionId}, {status:1}, function(err, dbexecution) {
                    console.log("Removing invalid record \n")
                    collection.remove({_id: exitDetails.executionId});
                    execs.deleteExecution(db, dbexecution, function() {
                        console.log("REMOVED ~~~~~~~~~~~~")
                    })
                    console.log("REMOVED: ~~~~~~~" + exitDetails.executionId + "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ \n")
                });
            });
        }
        finalResponse.contentType('json');
        finalResponse.status(statusCode);
        finalResponse.json({error : exitDetails.error});
    }
    finalResponse.end();
    console.log("_sendStatus end")
}

exports.startexecutionPost = function(req, res){
    var execution = {};
    var query = require('url').parse(req.url,true).query;
    execution.project = query.project;
    execution.user = query.user;
    execution.name = query.name;
    execution.status = "Ready To Run";
    execution.locked = true;
    execution.ignoreStatus = false;
    execution.ignoreAfterState = false;
    execution.ignoreScreenshots = (query.ignoreScreenshots == 'true');
    execution.allScreenshots = (query.uiSnapshots == 'true' );
    execution.lastRunDate = null;
    execution.testsetname = query.testset;
    execution.pullLatest = query.pullLatest;
    execution.sendEmail = (query.sendEmail == 'true');
    execution.sendEmailOnlyOnFailure = (query.sendEmailOnlyOnFailure == 'true');
    execution.emails = (query.emails) ? query.emails.split(',') : [];

    if(query.tags){
        execution.tag = query.tags.split(",");
    }
    if(query.retryCount) {
        execution.retryCount = query.retryCount;
    } else {
        execution.retryCount = '0';
    }
    execution._id = new ObjectID().toString();
    var validationDetails = { status : true, error : "" }
    if(!_validateQueryParams(query, validationDetails)) {
        var exitDetails = {statusCode : 400, error : "Mandatory parameter value(s) missing: "
                                                + validationDetails.error};
        _sendStatus(res, exitDetails);
        return;
    }

    _initializeDB(function(){
        console.log("call _prepareAndRunExecution 1")
        _prepareAndRunExecution(execution, query, res, function() {
           console.log("_prepareAndRunExecution completed 1")
        });
    })
}

function _prepareAndRunExecution(execution, query, res, callback){
    console.log("_prepareAndRunExecution")
    PullLatest(execution,function(){
        formatMachines(query,function(machines) {
            execution.machines = machines;
            execution.templates = [];
            if(query.cloudTemplate){
                execution.templates.push({name:query.cloudTemplate.split(":")[0],
                                         result:"",description:"",
                                         instances:parseInt(query.cloudTemplate.split(":")[1]),
                                         threads:parseInt(query.cloudTemplate.split(":")[2])});
            }
            formatTestSet(query.testset, query.project, function(testsetID){
                execution.testset = testsetID.toString();
                saveExecutionTestCases(testsetID,execution._id,function(testcases){
                    if(query.variables){
                        formatVariables(query.variables.split(","),query.project,function(variables){
                            execution.variables = variables;
                            SaveAndRunExecution(query,execution,testcases,res,function(exitDetails){
                                console.log("SaveAndRunExecution ----");
                                exitDetails.executionId = execution._id;
                                _sendStatus(res, exitDetails);
                                callback()
                                //db.close();
                            });
                        })
                    }
                    else{
                        execution.variables = [];
                        SaveAndRunExecution(query,execution,testcases,res,function(exitDetails){
                            console.log("SaveAndRunExecution +++++");
                            exitDetails.executionId = execution._id;
                            _sendStatus(res, exitDetails);
                            callback()
                            //db.close();
                        });
                    }
                });
            });
        });
    });
}

function _validateQueryParams(query, validationDetails) {
    var valid = true;
    if(!query.project ||
       !query.user ||
       !query.testset ||
       !query.machines ||
       !query.name) {
           valid = false;
       }

    if(valid === false && validationDetails) {
        if(!query.project) validationDetails.error = " project "
        if(!query.user) validationDetails.error += " user "
        if(!query.testset) validationDetails.error += " testset "
        if(!query.machines) validationDetails.error += " machines "
        if(!query.name) validationDetails.error += " name "
        validationDetails.status = false
    }

    return valid;
}

function saveExecutionTestCases(testsetID,executionID,callback){
    var testcases = [];
    db.collection('testsets', function(err, testSetCollection) {
        db.collection('executiontestcases', function(err, ExeTCCollection) {
            //console.log(testsetID);
            testSetCollection.findOne({_id:db.bson_serializer.ObjectID(testsetID.toString())}, {testcases:1}, function(err, dbtestcases) {
                dbtestcases.testcases.forEach(function(testcase,index){
                    db.collection('testcases', function(err, tcCollection) {
                        tcCollection.findOne({_id:db.bson_serializer.ObjectID(testcase._id.toString())},{},function(err,dbtestcase){
                            if(dbtestcase.tcData && dbtestcase.tcData.length > 0){
                                var ddTCCount = 0;
                                dbtestcase.tcData.forEach(function(row,rowIndex){
                                    var insertTC = {executionID:executionID,name:dbtestcase.name,tag:dbtestcase.tag,status:"Not Run",testcaseID:testcase._id.toString(),_id: new ObjectID().toString()};
                                    insertTC.rowIndex = rowIndex+1;
                                    insertTC.name = insertTC.name +"_"+(rowIndex+1);
                                    insertTC.tcData = row;
                                    testcases.push(insertTC);
                                    ExeTCCollection.insert(insertTC, {safe:true},function(err,returnData){
                                        ddTCCount++;
                                        if(ddTCCount == dbtestcase.tcData.length && index+1 == dbtestcases.testcases.length){
                                            callback(testcases);
                                        }
                                    });
                                })
                            }
                            else{
                                var insertTC = {executionID:executionID,name:dbtestcase.name,tag:dbtestcase.tag,status:"Not Run",testcaseID:testcase._id.toString(),_id: new ObjectID().toString()};
                                testcases.push(insertTC);
                                ExeTCCollection.insert(insertTC, {safe:true},function(err,returnData){
                                    if(index+1 == dbtestcases.testcases.length){
                                        callback(testcases);
                                    }
                                });
                            }
                        });
                    });
                });
            });
        });
    });
}

function PullLatest(execution,callback){
    if(execution.pullLatest !== "true"){
        callback();
        return
    }
    var options = {
        hostname: "localhost",
        port: common.Config.AppServerPort,
        path: '/scripts/pull',
        method: 'POST',
        agent:false,
        headers: {
            'Content-Type': 'application/json',
            'Cookie': 'username='+execution.user+";project="+execution.project
        }
    };

    var req = http.request(options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            //console.log('BODY: ' + chunk);
            callback();
        });
    });

    req.on('error', function(e) {
        console.log('problem with request: ' + e.message);
    });

    // write data to request body
    req.write(JSON.stringify({}));
    req.end();
}

function StartExecution(execution,testcases,finalResponse,callback){
    var options = {
        hostname: "localhost",
        port: common.Config.AppServerPort,
        path: '/executionengine/startexecution',
        method: 'POST',
        agent:false,
        headers: {
            'Content-Type': 'application/json',
            'Cookie': 'username='+execution.user+";project="+execution.project
        }
    };

    var req = http.request(options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            //console.log('BODY: ' + chunk);
            var msg = JSON.parse(chunk);
            var exitDetails = {statusCode : res.statusCode, error : ""};
            console.log("startexecution response " + res.statusCode);
            if(msg.error){
                exitDetails.error = msg.error;
                console.log(msg.error);
            }
            callback(exitDetails);
        });
    });

    req.on('error', function(e) {
        console.log('problem with request: ' + e.message);
    });

    // write data to request body
    req.write(JSON.stringify({retryCount:execution.retryCount,ignoreAfterState:false,ignoreStatus:execution.ignoreStatus,ignoreScreenshots:execution.ignoreScreenshots,testcases:testcases,variables:execution.variables,executionID:execution._id,machines:execution.machines,templates:execution.templates,
                              sendEmail:execution.sendEmail, sendEmailOnlyOnFailure:execution.sendEmailOnlyOnFailure,emails:execution.emails, allScreenshots:execution.allScreenshots}));
    req.end();
}

function SaveExecution(execution,callback){
    var options = {
        hostname: "localhost",
        port: common.Config.AppServerPort,
        path: '/executions/'+execution._id,
        method: 'POST',
        agent:false,
        headers: {
            'Content-Type': 'application/json',
            'Cookie': 'username='+execution.user+";project="+execution.project
        }
    };

    var req = http.request(options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            //console.log('BODY: ' + chunk);
            callback();
        });
    });

    req.on('error', function(e) {
        console.log('problem with request: ' + e.message);
    });

    // write data to request body
    req.write(JSON.stringify(execution));
    req.end();
}

function MonitorExecution(execution,callback){
    var getStatus = function(callback){
        db.collection('executions', function(err, collection) {
            collection.findOne({_id:execution._id}, {status:1}, function(err, dbexecution) {
                callback(dbexecution.status);
            });
        });
    };
    var verifyStatus = function(status){
        if(status == "Ready To Run"){
            setTimeout(function(){callback()},10000);
        }else{
            setTimeout(function(){getStatus(verifyStatus)},10000)
        }
    };
    setTimeout(function(){getStatus(verifyStatus)},20000)
}

function SaveAndRunExecution(queryParams,execution,testcases,finalResponse,callback){
    SaveExecution(execution,function(){
        StartExecution(execution,testcases,finalResponse,function(exitDetails){
            console.log("StartExecution callback");
            if(exitDetails.statusCode !== 0 && exitDetails.statusCode !== 200) {
                callback(exitDetails);
                console.log("StartExecution return");
                return;
            }

            MonitorExecution(execution,function(){
                var xmlReport = new xml();
                GenerateReport(finalResponse, queryParams,execution,xmlReport,function(exitDetails){
                    console.log("GenerateReport completed: ------------------------------");
                    finalResponse.set('Content-Type', 'application/xml');
                    finalResponse.write(xmlReport.toString());
                    finalResponse.end();
                    callback(exitDetails);
                })
            });
        })
    })
}

function formatTestSet(testset,project,callback){
    db.collection('testsets', function(err, collection) {
        collection.findOne({name:testset,project:project}, {_id:1}, function(err, dbtestset) {
            callback(dbtestset._id);
        });
    });
}

function formatVariables(clivariables,project,callback){
    var variables = [];
    var count = 0;
    db.collection('variables', function(err, collection) {
        clivariables.forEach(function(variable){
            collection.findOne({name:variable.split("=")[0].trim(),project:project}, {}, function(err, dbvariable) {
                dbvariable.value = variable.split("=")[1];
                variables.push(dbvariable);
                count++;
                if(count == clivariables.length){
                    callback(variables);
                }
            });
        });
    });
}

function formatMachines(reqQueryParams,callback){
    if(!reqQueryParams.machines) callback([]);
    var machines = reqQueryParams.machines.split(",");
    var result = [];
    var count = 0;
    db.collection('machines', function(err, collection) {
        machines.forEach(function(machine){
            collection.findOne({host:machine.split(":")[0]}, {}, function(err, dbmachine) {
                if(!dbmachine){
                    console.log("Machine: " +machine.split(":")[0]+" not found.");
                    callback([]);
                    return;
                }
                var threadsCount = machine.split(":")[1];
                dbmachine.threads = (threadsCount) ? threadsCount : 1;
                console.log("Threads Count : " + threadsCount);
                count++;
                if(machine.split(":").length == 3){
                    db.collection('actions', function(err, actionCollection) {
                        actionCollection.findOne({name:machine.split(":")[2]}, {}, function(err, action) {
                            if(action){
                                dbmachine.baseState = action._id;
                                result.push(dbmachine);
                                if(count == machines.length){
                                    callback(result);
                                }
                            }
                            else{
                                console.log("Suite Base state: " +machine.split(":")[2]+" not found.");
                                callback([]);
                                return;
                            }
                        });
                    });
                }
                else{
                    result.push(dbmachine);
                    if(count == machines.length){
                        callback(result);
                    }
                }
            });
        });
    });
}

function GenerateReport(finalResponse, queryParams,cliexecution,xw,callback){
    xw.startDocument();
    xw.startElement('testsuite');
    var exitDetails = {statusCode : 200, error: ""};
    db.collection('executions', function(err, collection) {
        collection.findOne({_id:cliexecution._id}, {}, function(err, execution) {
            cliexecution = execution;
            console.log("GenerateReport started: ------------------------------")
            //console.log(execution);
            //finalResponse.set('Content-Type', 'application/json');
            //finalResponse.write(JSON.stringify(execution));
            //callback(exitDetails);
            //finalResponse.end();
            xw.writeAttribute('errors', "0");
            xw.writeAttribute('failures', execution.failed.toString());
            xw.writeAttribute('tests', execution.total.toString());
            xw.writeAttribute('name',execution.name);
            xw.writeAttribute('time',execution.runtime.toString());
            xw.writeAttribute('timestamp',execution.lastRunDate.toString());
            xw.startElement('properties');
            xw.endElement();

            db.collection('executiontestcases', function(err, collection) {
                var failed = false;
                collection.find({executionID:execution._id}, {}, function(err, cursor) {
                    cursor.each(function(err, testcase) {
                        if(testcase == null) {
                            xw.endElement();
                            xw.endDocument();
                            //console.log(xw.toString());
                            callback(exitDetails);
                            return;
                        }
                        //console.log(testcase);
                        xw.startElement('testcase');
                        xw.writeAttribute('classname',testcase.name);
                        xw.writeAttribute('name',testcase.name);
                        xw.writeAttribute('time',(testcase.runtime / 1000).toString());
                        if (testcase.result == "Passed"){
                            xw.endElement();
                        }
                        else if (testcase.result == "Failed"){
                            failed = true;
                            xw.startElement('failure');
                            xw.writeAttribute('type',"Test Case Error");
                            xw.writeAttribute('message',testcase.error);

                             if(queryParams.resultURL){
                                 xw.writeCData(queryParams.resultURL+"/index.html?result="+testcase.resultID+"&project="+queryParams.project+"   "+testcase.trace);
                             }
                             else{
                                xw.writeCData(testcase.trace);
                             }

                            xw.endElement();
                            xw.endElement();
                        }
                        else{
                            xw.writeAttribute('executed',"false");
                            xw.endElement();
                        }
                    });
                })
            });
        });
    });
}

function _initializeDB(callback) {
    if(!db) {
        common.initDB(common.Config.DBPort,function(){
            db = app.getDB()
            callback()
        })
    } else {
        callback()
    }
}

/*
**************************************************************************************
    API : /api/remoteexecution/verifyexecution
    Mandatory params:
        (a)user
        (b)name
        (c)project
        (d)testset
        (e)machines
    Purpose:
        (1) Verify required parameters are passed in
        (2) Verify whether the param values exists in DB

**************************************************************************************
*/
exports.verifyexecutionGet = function(req, res) {
    console.log("verifyexecutionGet");
    _verifyexecution(req, res);
}

function _verifyexecution(req, res) {
    console.log("/api/remoteexecution/verifyexecution");
    var validationDetails = {status: true, error: "" };
    var newQueryObj = {};
    var query = require('url').parse(req.url,true).query;

    // query param validation
    if(!_validateQueryParams(query, validationDetails)) {
        var exitDetails = {statusCode : 400, error : "Mandatory parameter value(s) missing: "
                                                        + validationDetails.error };
        _sendStatus(res, exitDetails);
        return;
    }

    _initializeDB(function(){
        // (a) validate user
        verifyUser(query.user, function(error) {
            if(error) {
                validationDetails.status = false;
                validationDetails.error = validationDetails.error + error;
            }else {
                console.log(query.user);
                newQueryObj.user = query.user;
            }
        })

        // (b) validate execution 'name' parameter
        /*verifyExecution(query.name, function(error) {
            if(error) {
                validationDetails.status = false;
                validationDetails.error = validationDetails.error + error;
            }else {
                console.log(query.name);
                newQueryObj.name = query.name;
            }
        });*/

        // (c) & (d) validates testset, project
        validateTestSet(query.testset, query.project, function(error, testsetObj){
            if(error || !testsetID) {
                validationDetails.status = false;
                validationDetails.error = validationDetails.error + error;
            } else {
                newQueryObj.project = testsetObj.project;
                newQueryObj.testset = testsetObj._id;
            }
        })

        // (e) parses query for machines and returns an array of machines
        //   Also verifies the DB for valid machine in 'machines' collection
        formatMachines(query, function(machines) {
            if(!machines || machines.length == 0) {
                validationDetails.status = false;
                validationDetails.error = validationDetails.error + " machines ";
            } else {
                newQueryObj.machines = machines;
            }
        })

        setTimeout(function(){
            //console.log(newQueryObj);
            //console.log(validationDetails);

            if(!validationDetails.status) {
                var exitDetails = {statusCode : 400, error : "Invalid Query Parameter value(s): " + validationDetails.error };
                _sendStatus(res, exitDetails);
            } else {
                res.status(200).json({ status: 'success' });
            }
        },400);
    })
}

function validateTestSet(testset,project,callback){
    if(!testset || !project) callback(" testset/project ", null);
    db.collection('testsets', function(err, collection) {
        collection.findOne({name:testset,project:project}, function(err, dbtestset) {
            if(err || !dbtestset) {
                console.log("validateTestSet failure ")
                callback(" testset/project ", null);
            } else {
                console.log("validateTestSet success ")
                console.log(dbtestset);
                callback(null, dbtestset);
            }
        });
    });
}

function verifyUser(username,callback){
    if(!username) callback(" user ");
    db.collection('users', function(err, collection) {
        collection.findOne({username:username},function(err,user){
            if (err || !user){
                callback(" user ");
            }
            else{
                callback();
            }
        });
    })
}

/*
function verifyExecution(executionName,callback){
    if(!executionName) callback(" name ");
    db.collection('executions', function(err, collection) {
        collection.findOne({name:executionName},function(err,execution){
            if (execution == null){
                callback(" name ");
            }
            else{
                callback();
            }
        });
    })
}*/
