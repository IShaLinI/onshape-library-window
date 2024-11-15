var express = require('express');
var session = require('express-session');
var redis = require('redis');

var router = express.Router();
var authentication = require('../authentication');
var request = require('request-promise');
var url = require('url');
var fs = require('fs');
const { version } = require('os');
const passport = require('passport');
const NodeCache = require( "node-cache" );
const { MongoClient } = require("mongodb");

var apiUrl = 'https://cad.onshape.com';
var adminTeamId = process.env.ADMIN_TEAM;
var brokenImg = "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABmJLR0QA/wD/AP+gvaeTAAAAy0lEQVRIie2VXQ6CMBCEP7yDXkEjeA/x/icQgrQcAh9czKZ0qQgPRp1kk4ZZZvYnFPhjJi5ABfRvRgWUUwZLxIe4asEsMOhndmzhqbtZSdDExxh0EhacRBIt46V5oJDwEd4BuYQjscc90ATiJ8UfgFvEXPNNqotCKtEvF8HZS87wLAeOijeRTwhahsNoWmVi4pWRhLweqe4qCp1kLVUv3UX4VgtaX7IXbmsU0knuzuCz0SEwWIovvirqFTSrKbLkcZ8v+RecVyjyl3AHdAl3ObMLisAAAAAASUVORK5CYII=";
const mongouri = process.env.MONGODB_URI;
// Create a new MongoClient
const mongo = new MongoClient(mongouri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
var db;
mongo.connect().then(() => {
  console.log("MongoDB Connected");
  db = mongo.db(process.env.MONGODB_DB);
});

if (process.env.API_URL) {
  apiUrl = process.env.API_URL;
}

var client;
if (process.env.REDISTOGO_URL) {
  var rtg   = require("url").parse(process.env.REDISTOGO_URL);
  client = require("redis").createClient(rtg.port, rtg.hostname);

  client.auth(rtg.auth.split(":")[1]);
} else if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
  client = require("redis").createClient(process.env.REDIS_PORT, process.env.REDIS_HOST);
} else {
  client = redis.createClient();
}

const myCache = new NodeCache({stdTTL: 3600, checkperiod: 600});

router.sendNotify = function(req, res) {
  if (req.body.event == 'onshape.model.lifecycle.changed') {
    var state = {
      elementId : req.body.elementId,
      change : true
    };

    var stateString = JSON.stringify(state);
    var uniqueID = "change" + req.body.elementId;
    client.set(uniqueID, stateString);
  }

  res.send("ok");
}

router.post('/logout', function(req, res) {
  req.session.destroy();
  return res.send({});
});

function makeAPICall(req, res, endpoint, method, nosend) {
  var targetUrl = apiUrl + endpoint;
  return new Promise((resolve, reject) => {
    method({
      uri: targetUrl,
      json: true,
      body: req.body,
      headers: {
        'Authorization': 'Bearer ' + req.user.accessToken
      }
    }).catch((data) => {
      console.log("CATCH " + data.statusCode);
      if (data.statusCode === 401) {
        authentication.refreshOAuthToken(req, res).then(function() {
          makeAPICall(req, res, endpoint, method, nosend).then((data) => {
            resolve(data);
          }).catch((data) => {
            reject(data);
          });
        }).catch(function(err) {
          console.log('Error refreshing token: ', err);
          reject();
        });
      } else {
        console.log('Error: ', data.statusCode);
        reject(data);
      }
    }).then((data) => {
      if (!nosend) {
        res.send(data);
      }
      resolve(data);
    });
  });
}

function callInsert(req, res) {
  if (req.query.documentId === undefined || req.query.workspaceId === undefined || req.query.elementId === undefined) {
    res.status(404).send();
    return;
  }
  var targetUrl = apiUrl + '/api/assemblies/d/' + req.query.documentId + '/w/' + req.query.workspaceId + '/e/' + req.query.elementId + '/instances';
  return new Promise((resolve, reject) => {
    request.post({
      uri: targetUrl,
      json: true,
      body: req.body,
      headers: {
        'Authorization': 'Bearer ' + req.user.accessToken,
        'Content-Type': 'application/vnd.onshape.v2+json;charset=UTF-8;qs=0.2',
        'accept': 'application/vnd.onshape.v2+json;charset=UTF-8;qs=0.2'
      }
    }).catch((data) => {
      console.log("CATCH " + data.statusCode);
      if (data.statusCode === 401) {
        authentication.refreshOAuthToken(req, res).then(function() {
          callInsert(req, res).then((data) => {
            resolve(data);
          }).catch((data) => {
            reject(data);
          });
        }).catch(function(err) {
          console.log('Error refreshing token: ', err);
          reject();
        });
      }
      else if (data.statusCode === 403) {
        console.log('Error: ' , JSON.stringify(data, null, 2));
      } else {
        console.log('Error: ', data.statusCode);
        reject(data);
      }
    }).then((data) => {
      res.send(data);
      resolve(data);
    });
  });
}

function callDerive(req, res) {
  if (req.query.documentId === undefined || req.query.workspaceId === undefined || req.query.elementId === undefined) {
    res.status(404).send();
    return;
  }
  var targetUrl = apiUrl + '/api/partstudios/d/' + req.query.documentId + '/w/' + req.query.workspaceId + '/e/' + req.query.elementId + '/features';
  return new Promise((resolve, reject) => {
    request.post({
      uri: targetUrl,
      json: true,
      body: req.body,
      headers: {
        'Authorization': 'Bearer ' + req.user.accessToken,
        'Content-Type': 'application/vnd.onshape.v2+json;charset=UTF-8;qs=0.2',
        'accept': 'application/vnd.onshape.v2+json;charset=UTF-8;qs=0.2'
      }
    }).catch((data) => {
      console.log("CATCH " + data.statusCode);
      if (data.statusCode === 401) {
        authentication.refreshOAuthToken(req, res).then(function() {
          callDerive(req, res).then((data) => {
            resolve(data);
          }).catch((data) => {
            reject(data);
          });
        }).catch(function(err) {
          console.log('Error refreshing token: ', err);
          reject();
        });
      }
      else if (data.statusCode === 400) {
        console.log('Error: ' , JSON.stringify(data, null, 2));
      }
      else if (data.statusCode === 403) {
        console.log('Error: ' , JSON.stringify(data, null, 2));
      } else {
        console.log('Error: ', data.statusCode);
        reject(data);
      }
    }).then((data) => {
      res.send(data);
      resolve(data);
    });
  });
}

var documents = JSON.parse(fs.readFileSync('documents.json', 'utf8'));;
var META = {
  ASSEM: 1,
  PARTSTUDIO: 0
}

function getName(metaItem) {
  for (var i = 0; i < metaItem.properties.length; ++i) {
    var item = metaItem.properties[i];
    if (item.name === "Name") {
      var name = item.value;
      return name;
    }
  }
}

function checkAuth(id) {
  return new Promise((resolve, reject) => {
    client.get("auth" + id, function(getError, data) {
      if (getError) throw getError;

      if (data !== null && data) {
        resolve();
      }
      else {
        reject("Unauthenticated");
      }
    });
  });
}

function documentList(req, res) {
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(documents);
}

function reprocessConfigurationDef(returnedConfigDef) {
  var reprocessed = [];
  returnedConfigDef.configurationParameters.forEach((param) => {
    let newParam = {};
    newParam.id = param.message.parameterId; // Internal ID
    newParam.name = param.message.parameterName; // Human-readable name

    if (param.typeName === "BTMConfigurationParameterQuantity") {
      // Need to record
      newParam.type = "QUANTITY";
      newParam.quantityType = param.message.quantityType; // length, angle, real, int, etc
      newParam.quantityUnits = param.message.rangeAndDefault.message.units; // inch, mm, deg
      newParam.quantityMin = param.message.rangeAndDefault.message.minValue;
      newParam.quantityMax = param.message.rangeAndDefault.message.maxValue;
      newParam.default = param.message.rangeAndDefault.message.defaultValue;
    }
    else if (param.typeName === "BTMConfigurationParameterEnum") {
      newParam.type = "ENUM";
      newParam.default = param.message.defaultValue;
      newParam.options = [];
      param.message.options.forEach((option) => {
        var newOpt = {};
        newOpt.name = option.message.optionName; // Human-readable
        newOpt.value = option.message.option; // Internal
        newParam.options.push(newOpt);
      });
    }
    else if (param.typeName === "BTMConfigurationParameterBoolean") {
      newParam.type = "BOOLEAN";
      newParam.default = param.message.defaultValue;
    }
    else if (param.typeName === "BTMConfigurationParameterString") {
      newParam.type = "STRING";
      newParam.default = param.message.defaultValue;
    }
    reprocessed.push(newParam);
  });
  return reprocessed;
}

function fetchThumb(item, req, res) {

  return new Promise((resolve, reject) => {
    var key;
    if (item.type === "ASSEMBLY" || item.type === "PARTSTUDIO") {
      key = "thumb"+ item.documentId + "/" +item.versionId + "/" + item.elementId;
    }
    else if (item.type === "PART") {
      key = "thumb"+ item.documentId + "/" +item.versionId + "/" + item.elementId + "/" + item.partId;
    }
    else {
      reject();
      return;
    }
    var template = {
      documentId: item.documentId,
      elementId: item.elementId,
      versionId: item.versionId,
      partId: item.partId
    };
    var thumbs = db.collection("thumbs");
    thumbs.findOne(template).then((cached) => {
      if (cached === null || cached === undefined) {
        var bbEndpoint;
        var viewsEndpoint;
        if (item.type === "ASSEMBLY") {
          bbEndpoint = '/api/assemblies/d/'+ item.documentId +'/v/'+item.versionId+'/e/' + item.elementId + '/boundingboxes';
          viewsEndpoint = '/api/assemblies/d/'+ item.documentId +'/v/'+item.versionId+'/e/' + item.elementId + '/shadedviews';
        }
        else if (item.type === "PART") {
          bbEndpoint = '/api/parts/d/'+ item.documentId +'/v/'+item.versionId+'/e/' + item.elementId + '/partid/' + item.partId + '/boundingboxes';
          viewsEndpoint = '/api/parts/d/'+ item.documentId +'/v/'+item.versionId+'/e/' + item.elementId + '/partid/' + item.partId + '/shadedviews';
        }
        else if (item.type === "PARTSTUDIO") {
          bbEndpoint = '/api/partstudios/d/'+ item.documentId +'/v/'+item.versionId+'/e/' + item.elementId + '/boundingboxes';
          viewsEndpoint = '/api/partstudios/d/'+ item.documentId +'/v/'+item.versionId+'/e/' + item.elementId + '/shadedviews';
        }
        else {
          reject();
          return;
        }
        makeAPICall(req, res, bbEndpoint, request.get, true).then((bb) => {
          var view = makeThumbView(bb);
          var viewMatrix = view.view;
          var thumbPixelSize = view.size / thumbHeight;
          makeAPICall(req, res, viewsEndpoint + '?viewMatrix=' + viewMatrix + '&outputHeight=' + thumbHeight + '&outputWidth=' + thumbWidth + '&pixelSize=' + thumbPixelSize, request.get, true).then((data) => {
            var thumb = data.images[0];
            template.thumb = thumb;
            thumbs.insertOne(template);
            resolve(thumb);
          }).catch(() => {
            var thumb = brokenImg;
            template.thumb = thumb;
            thumbs.insertOne(template);
            resolve(thumb);
          });
        }).catch(() => {
          var thumb = brokenImg;
          template.thumb = thumb;
          thumbs.insertOne(template);
          resolve(thumb);
        });
      }
      else {
        resolve(cached.thumb);
      }
    }).catch(() => reject());

  });

}
// Update this variable when the structure of the stored data changes
var SCHEMA_VERSION = 1;
function documentData(req, res) {

  checkAuth(req.user.id).then(() => {
    var insertable_data = [];
    var versionPromisesLeft = documents.length;
    var documentId = req.query.documentId;

    var stored = db.collection("stored");
    var logCollection = db.collection("logs");
    var updateLogs = function(item, action, result, message) {
      var logObj = {
        documentId: item.documentId,
        elementId: item.elementId,
        partId: item.partId,
        type: item.type,
        userId: req.user.id,
        result: result,
        message: message,
        action: action,
        source: "purge_old",
        time: new Date().toISOString(),
      }
      return logCollection.insertOne(logObj);
    }

    stored.find({documentId: documentId}).toArray().then((visible_items) => {
      var oldVerMap = {};
      var oldSchemaMap = {};
      if (visible_items !== undefined && Array.isArray(visible_items)) {
        visible_items.forEach((item) => {
          var key = "";
          if (item.partId) {
            key = item.elementId + "/" + item.partId;
            
          }
          else {
            key = item.elementId;
          }
          oldVerMap[key] = item.versionId;
          oldSchemaMap[key] = item.schemaVersion;
        });
      }

      function lastVersion(elementId, partId) {
        var key = "";
        if (partId) {
          key = elementId + "/" + partId;
        }
        else {
          key = elementId;
        }
        return oldVerMap[key];
      }
      function lastSchemaVersion(elementId, partId) {
        var key = "";
        if (partId) {
          key = elementId + "/" + partId;
        }
        else {
          key = elementId;
        }
        var r = oldSchemaMap[key];
        if (r === undefined) {
          return 0;
        }
        else {
          return r;
        }
      }

      var versionReq = req;
      versionReq.query = {
        documentId: documentId
      };
      var versionPromise = getVersionsRaw(versionReq, res).then((versions) => {
        var versionId = versions[versions.length - 1].id;
        // Collect assemblies and part studios
        eMetaReq = req;
        eMetaReq.query = {
          documentId: documentId,
          versionId: versionId
        };
        var eMetaPromise = getElementsRaw(eMetaReq, res).then((metadataResult) => {
          var elementsLeft = metadataResult.length;
          var elementIds = [];
          var elementPartIdMap = {};
          var decreaseElements = function() {
            elementsLeft--;
            if (elementsLeft === 0) {
              // Delete parts that no longer exist
              var stored = db.collection("stored");
              stored.find({documentId: documentId}).toArray().then((data) => {
                data.forEach((item) => {
                  if (!elementIds.includes(item.elementId) || (item.partId && !elementPartIdMap[item.elementId].includes(item.partId))) {
                    // Missing part
                    console.log("Deleting:");
                    console.log(item);
                    stored.deleteOne(item).then((result) => {
                      updateLogs(item, "REMOVE", "success", result["result"]);
                    }).catch((err) => {
                      updateLogs(item, "REMOVE", "failure", err);
                    });
                  }
                })
              });
              res.send(insertable_data);
            }
          };

          metadataResult.forEach((metaItem) => {
            elementIds.push(metaItem.id);
            if (metaItem.elementType === "ASSEMBLY" || metaItem.elementType === "PARTSTUDIO") {
              var eConfigReq = req;
              eConfigReq.query = {
                documentId: documentId,
                versionId: versionId,
                elementId: metaItem.id,
              };
              var eConfigPromise = getElementConfigurationRaw(eConfigReq, res).then((configResult) => {
                var configOpts = reprocessConfigurationDef(configResult);
                var elementName = metaItem.name;
                if (metaItem.elementType === "ASSEMBLY") {
                  var item = {
                    type: "ASSEMBLY",
                    name: elementName,
                    elementId: metaItem.id,
                    versionId: versionId,
                    microversionId: metaItem.microversionId,
                    documentId: documentId,
                    lastVersion: lastVersion(metaItem.id),
                    schemaVersion: SCHEMA_VERSION,
                    lastSchemaVersion: lastSchemaVersion(metaItem.id),
                    config: configOpts
                  };
                  fetchThumb(item, req, res).then((thumb) => {
                    item.thumb = thumb;
                  }).catch(() => {}).finally(() => {
                    insertable_data.push(item);
                    decreaseElements();
                  });

                }
                else if (metaItem.elementType === "PARTSTUDIO") {
                  elementPartIdMap[metaItem.id] = [];
                  partMetaReq = req;
                  partMetaReq.query = {
                    documentId: documentId,
                    elementId: metaItem.id,
                    versionId: versionId
                  };
                  var pMetaPromise = getPartsMetadataRaw(partMetaReq, res).then((itemMetaResult) => {
                    if (itemMetaResult === undefined) {
                      decreaseElements();
                      return;
                    }
                    var nonCompositeParts = [];
                    var compositeParts = [];
                    itemMetaResult.items.forEach((part) => {
                      var name = getName(part);
                      if (configOpts.length > 0) {
                        name = elementName;
                      }
                      var item = {
                        type: "PART",
                        name: name,
                        partId: part.partId,
                        elementId: metaItem.id,
                        versionId: versionId,
                        microversionId: metaItem.microversionId,
                        documentId: documentId,
                        lastVersion: lastVersion(metaItem.id, part.partId),
                        schemaVersion: SCHEMA_VERSION,
                        lastSchemaVersion: lastSchemaVersion(metaItem.id, part.partId),
                        config: configOpts
                      };
                      if (part.partType === "composite") {
                        
                        compositeParts.push(item);
                      }
                      else {
                        nonCompositeParts.push(item);
                      }
                    });
                    var addParts = [];
                    if (compositeParts.length > 0) {
                      addParts = compositeParts;
                    }
                    else {
                      if (nonCompositeParts.length > 10) {
                        nonCompositeParts = []; // A lot of parts means this is probably parts for an assembly
                        var item = {
                          type: "PARTSTUDIO",
                          name: elementName,
                          elementId: metaItem.id,
                          versionId: versionId,
                          microversionId: metaItem.microversionId,
                          documentId: documentId,
                          lastVersion: lastVersion(metaItem.id),
                          schemaVersion: SCHEMA_VERSION,
                          lastSchemaVersion: lastSchemaVersion(metaItem.id),
                          config: configOpts
                        };
                        fetchThumb(item, req, res).then((thumb) => {
                          item.thumb = thumb;
                        }).catch(() => {}).finally(() => {
                          insertable_data.push(item);
                          decreaseElements();
                        });
                      }
                      addParts = nonCompositeParts;
                    }
                    var partsLeft = addParts.length;
                    if (partsLeft === 0) {
                      decreaseElements();
                    }
                    addParts.forEach((item) => {
                      fetchThumb(item, req, res).then((thumb) => {
                        item.thumb = thumb;
                      }).catch(() => {}).finally(() => {
                        insertable_data.push(item);
                        elementPartIdMap[metaItem.id].push(item.partId);
                        partsLeft--;
                        if (partsLeft === 0) {
                          decreaseElements();
                        }
                      });
                    });
                  }); // part meta promise
                  
                }
              }); // configuration promise
            }
            else { // All non-part studio non-assemblies
              decreaseElements();
            }
            // element type switch
          }); // metadata meta foreach
        }); // element meta promise

      }); // versions promise
    }); // db get


  }).catch(() => {
    res.status(401).send();
  }); // auth promise
}

function saveDocumentData(req, res) {

  checkAuth(req.user.id).then(() => {
    var newItem = req.body.item;
    var action = req.body.action;

    var stored = db.collection("stored");
    var filterObj = {
      documentId: newItem.documentId,
      elementId: newItem.elementId,
      partId: newItem.partId,
      type: newItem.type
    };

    var updateLogs = function(result, message) {
      var logCollection = db.collection("logs");
      var logObj = {
        documentId: newItem.documentId,
        elementId: newItem.elementId,
        partId: newItem.partId,
        type: newItem.type,
        userId: req.user.id,
        result: result,
        message: message,
        action: action,
        source: "manual_action",
        time: new Date().toISOString(),
      }
      return logCollection.insertOne(logObj);
    }

    var successCallback = function(result) {
      updateLogs("success", result["result"]);
      res.status(200).send();
    };
    var err = function(er) {
      console.log(er);
      updateLogs("failure", er);
      res.status(500).send();
    };

    if (action === "REPLACE") {
      stored.updateOne(filterObj, {$set: newItem}, {upsert: true, multi: false}).then(successCallback).catch(err);
    }
    else if (action === "REMOVE") {
      stored.deleteOne(filterObj).then(successCallback).catch(err);
    }
    else {
      err("Unrecognized action " + action);
    }
  }).catch((err) => {
    console.log(err);
    res.status(401).send();
  }); // auth promise
}

function getUserIsAdmin(req, res) {
  // Temporary shim
  // client.set("auth" + req.user.id, true);
  //res.send({auth: true});
  //return;
  var targetUrl = apiUrl + "/api/teams/" + adminTeamId;
  request.get({
    uri: targetUrl,
    json: true,
    body: req.body,
    headers: {
      'Authorization': 'Bearer ' + req.user.accessToken
    }
  }).then((data) => {
    client.set("auth" + req.user.id, true);
    res.send({auth: true});
  }).catch((data) => {
    console.log("CATCH " + data.statusCode);
    if (data.statusCode === 401) {
      authentication.refreshOAuthToken(req, res).then(function() {
        getUserIsAdmin(req, res);
      }).catch(function(err) {
        console.log('Error refreshing token: ', err);
      });
    } else if (data.statusCode === 403) { // possible expected outcome
      res.send({auth: false});
    }
    else {
      res.send({auth: false});
      console.log('Error: ', data);
    }
  });
}

function getData(req, res) {
  res.setHeader("Cache-Control", "private, max-age=1800");
  var stored = db.collection("stored");
  stored.find({}).toArray().then((data) => {
    res.send(data);
  })
}

var getVersions = (req, res) => makeAPICall(req, res, '/api/documents/d/' + req.query.documentId + '/versions', request.get);
//var callInsert = (req, res) => makeAPICall(req, res, '/api/assemblies/d/' + req.query.documentId + '/w/' + req.query.workspaceId + '/e/' + req.query.elementId + '/instances', request.post);
var getElements = (req, res) => makeAPICall(req, res, '/api/documents/d/' + req.query.documentId + '/v/' + req.query.versionId + '/elements', request.get);
var getElementsRaw = (req, res) => makeAPICall(req, res, '/api/documents/d/' + req.query.documentId + '/v/' + req.query.versionId + '/elements', request.get, true);
var getElementsMetadata = (req, res) => makeAPICall(req, res, '/api/metadata/d/' + req.query.documentId + '/v/' + req.query.versionId + '/e', request.get);
var getPartsMetadata = (req, res) => makeAPICall(req, res, '/api/metadata/d/' + req.query.documentId + '/v/' + req.query.versionId + '/e/' + req.query.elementId + '/p', request.get);

var getElementsMetadataRaw = (req, res) => makeAPICall(req, res, '/api/metadata/d/' + req.query.documentId + '/v/' + req.query.versionId + '/e', request.get, true);
var getPartsMetadataRaw = (req, res) => makeAPICall(req, res, '/api/metadata/d/' + req.query.documentId + '/v/' + req.query.versionId + '/e/' + req.query.elementId + '/p', request.get, true);
var getVersionsRaw = (req, res) => makeAPICall(req, res, '/api/documents/d/' + req.query.documentId + '/versions', request.get, true);
var getElementConfigurationRaw = (req, res) => makeAPICall(req, res, '/api/elements/d/' + req.query.documentId + '/v/' + req.query.versionId + '/e/' + req.query.elementId + '/configuration', request.get, true);

router.get('/versions', getVersions);
// Insert
router.post('/insert', callInsert);
router.post('/derive', callDerive);
router.get('/elements', getElements);
// Metadata
router.get('/elements_metadata', getElementsMetadata);
router.get('/parts_metadata', getPartsMetadata);
// Thumbnails
var thumbView = "0.612,0.612,0,0,"+
                "-0.354,0.354,0.707,0," +
                "0.707,-0.707,0.707,0"; // Isometric view

var thumbHeight = 60;
var thumbWidth = 60;

function makeThumbView(boundingBox) {
  if (boundingBox === undefined) {
    return thumbView;
  }
  var xCenter = (boundingBox.highX + boundingBox.lowX) / 2;
  var yCenter = (boundingBox.highY + boundingBox.lowY) / 2;
  var zCenter = (boundingBox.highZ + boundingBox.lowZ) / 2;

  var tX = (xCenter * 0.707 + yCenter * 0.707 + zCenter * 0);
  var tY = (xCenter * -0.409 + yCenter * 0.409 + zCenter * 0.816);
  var tZ = (xCenter * 0.577 + yCenter * -0.577 + zCenter * 0.577);

  var sizeX = boundingBox.highX - boundingBox.lowX;
  var sizeY = boundingBox.highY - boundingBox.lowY;
  var sizeZ = boundingBox.highZ - boundingBox.lowZ;
  var size = Math.sqrt(sizeX*sizeX + sizeY*sizeY + sizeZ*sizeZ) * 1;

  return {view: "0.612,0.612,0," + (-tX) + ",-0.354,0.354,0.707, " + (-tY) + ",0.707,-0.707,0.707," + (-tZ), size: size};
}


// Non-passthrough API
router.get('/data', getData);
router.get('/documentData', documentData);
router.post('/saveDocumentData', saveDocumentData);
router.get('/isAdmin', getUserIsAdmin);
router.get('/documents', documentList);

module.exports = router;
