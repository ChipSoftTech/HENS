(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/mongo/mongo_driver.js                                                                                     //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
/**                                                                                                                   // 1
 * Provide a synchronous Collection API using fibers, backed by                                                       // 2
 * MongoDB.  This is only for use on the server, and mostly identical                                                 // 3
 * to the client API.                                                                                                 // 4
 *                                                                                                                    // 5
 * NOTE: the public API methods must be run within a fiber. If you call                                               // 6
 * these outside of a fiber they will explode!                                                                        // 7
 */                                                                                                                   // 8
                                                                                                                      // 9
var path = Npm.require('path');                                                                                       // 10
var MongoDB = Npm.require('mongodb');                                                                                 // 11
var Fiber = Npm.require('fibers');                                                                                    // 12
var Future = Npm.require(path.join('fibers', 'future'));                                                              // 13
                                                                                                                      // 14
MongoInternals = {};                                                                                                  // 15
MongoTest = {};                                                                                                       // 16
                                                                                                                      // 17
// This is used to add or remove EJSON from the beginning of everything nested                                        // 18
// inside an EJSON custom type. It should only be called on pure JSON!                                                // 19
var replaceNames = function (filter, thing) {                                                                         // 20
  if (typeof thing === "object") {                                                                                    // 21
    if (_.isArray(thing)) {                                                                                           // 22
      return _.map(thing, _.bind(replaceNames, null, filter));                                                        // 23
    }                                                                                                                 // 24
    var ret = {};                                                                                                     // 25
    _.each(thing, function (value, key) {                                                                             // 26
      ret[filter(key)] = replaceNames(filter, value);                                                                 // 27
    });                                                                                                               // 28
    return ret;                                                                                                       // 29
  }                                                                                                                   // 30
  return thing;                                                                                                       // 31
};                                                                                                                    // 32
                                                                                                                      // 33
// Ensure that EJSON.clone keeps a Timestamp as a Timestamp (instead of just                                          // 34
// doing a structural clone).                                                                                         // 35
// XXX how ok is this? what if there are multiple copies of MongoDB loaded?                                           // 36
MongoDB.Timestamp.prototype.clone = function () {                                                                     // 37
  // Timestamps should be immutable.                                                                                  // 38
  return this;                                                                                                        // 39
};                                                                                                                    // 40
                                                                                                                      // 41
var makeMongoLegal = function (name) { return "EJSON" + name; };                                                      // 42
var unmakeMongoLegal = function (name) { return name.substr(5); };                                                    // 43
                                                                                                                      // 44
var replaceMongoAtomWithMeteor = function (document) {                                                                // 45
  if (document instanceof MongoDB.Binary) {                                                                           // 46
    var buffer = document.value(true);                                                                                // 47
    return new Uint8Array(buffer);                                                                                    // 48
  }                                                                                                                   // 49
  if (document instanceof MongoDB.ObjectID) {                                                                         // 50
    return new Mongo.ObjectID(document.toHexString());                                                                // 51
  }                                                                                                                   // 52
  if (document["EJSON$type"] && document["EJSON$value"]                                                               // 53
      && _.size(document) === 2) {                                                                                    // 54
    return EJSON.fromJSONValue(replaceNames(unmakeMongoLegal, document));                                             // 55
  }                                                                                                                   // 56
  if (document instanceof MongoDB.Timestamp) {                                                                        // 57
    // For now, the Meteor representation of a Mongo timestamp type (not a date!                                      // 58
    // this is a weird internal thing used in the oplog!) is the same as the                                          // 59
    // Mongo representation. We need to do this explicitly or else we would do a                                      // 60
    // structural clone and lose the prototype.                                                                       // 61
    return document;                                                                                                  // 62
  }                                                                                                                   // 63
  return undefined;                                                                                                   // 64
};                                                                                                                    // 65
                                                                                                                      // 66
var replaceMeteorAtomWithMongo = function (document) {                                                                // 67
  if (EJSON.isBinary(document)) {                                                                                     // 68
    // This does more copies than we'd like, but is necessary because                                                 // 69
    // MongoDB.BSON only looks like it takes a Uint8Array (and doesn't actually                                       // 70
    // serialize it correctly).                                                                                       // 71
    return new MongoDB.Binary(new Buffer(document));                                                                  // 72
  }                                                                                                                   // 73
  if (document instanceof Mongo.ObjectID) {                                                                           // 74
    return new MongoDB.ObjectID(document.toHexString());                                                              // 75
  }                                                                                                                   // 76
  if (document instanceof MongoDB.Timestamp) {                                                                        // 77
    // For now, the Meteor representation of a Mongo timestamp type (not a date!                                      // 78
    // this is a weird internal thing used in the oplog!) is the same as the                                          // 79
    // Mongo representation. We need to do this explicitly or else we would do a                                      // 80
    // structural clone and lose the prototype.                                                                       // 81
    return document;                                                                                                  // 82
  }                                                                                                                   // 83
  if (EJSON._isCustomType(document)) {                                                                                // 84
    return replaceNames(makeMongoLegal, EJSON.toJSONValue(document));                                                 // 85
  }                                                                                                                   // 86
  // It is not ordinarily possible to stick dollar-sign keys into mongo                                               // 87
  // so we don't bother checking for things that need escaping at this time.                                          // 88
  return undefined;                                                                                                   // 89
};                                                                                                                    // 90
                                                                                                                      // 91
var replaceTypes = function (document, atomTransformer) {                                                             // 92
  if (typeof document !== 'object' || document === null)                                                              // 93
    return document;                                                                                                  // 94
                                                                                                                      // 95
  var replacedTopLevelAtom = atomTransformer(document);                                                               // 96
  if (replacedTopLevelAtom !== undefined)                                                                             // 97
    return replacedTopLevelAtom;                                                                                      // 98
                                                                                                                      // 99
  var ret = document;                                                                                                 // 100
  _.each(document, function (val, key) {                                                                              // 101
    var valReplaced = replaceTypes(val, atomTransformer);                                                             // 102
    if (val !== valReplaced) {                                                                                        // 103
      // Lazy clone. Shallow copy.                                                                                    // 104
      if (ret === document)                                                                                           // 105
        ret = _.clone(document);                                                                                      // 106
      ret[key] = valReplaced;                                                                                         // 107
    }                                                                                                                 // 108
  });                                                                                                                 // 109
  return ret;                                                                                                         // 110
};                                                                                                                    // 111
                                                                                                                      // 112
                                                                                                                      // 113
MongoConnection = function (url, options) {                                                                           // 114
  var self = this;                                                                                                    // 115
  options = options || {};                                                                                            // 116
  self._observeMultiplexers = {};                                                                                     // 117
  self._onFailoverHook = new Hook;                                                                                    // 118
                                                                                                                      // 119
  var mongoOptions = {db: {safe: true}, server: {}, replSet: {}};                                                     // 120
                                                                                                                      // 121
  // Set autoReconnect to true, unless passed on the URL. Why someone                                                 // 122
  // would want to set autoReconnect to false, I'm not really sure, but                                               // 123
  // keeping this for backwards compatibility for now.                                                                // 124
  if (!(/[\?&]auto_?[rR]econnect=/.test(url))) {                                                                      // 125
    mongoOptions.server.auto_reconnect = true;                                                                        // 126
  }                                                                                                                   // 127
                                                                                                                      // 128
  // Disable the native parser by default, unless specifically enabled                                                // 129
  // in the mongo URL.                                                                                                // 130
  // - The native driver can cause errors which normally would be                                                     // 131
  //   thrown, caught, and handled into segfaults that take down the                                                  // 132
  //   whole app.                                                                                                     // 133
  // - Binary modules don't yet work when you bundle and move the bundle                                              // 134
  //   to a different platform (aka deploy)                                                                           // 135
  // We should revisit this after binary npm module support lands.                                                    // 136
  if (!(/[\?&]native_?[pP]arser=/.test(url))) {                                                                       // 137
    mongoOptions.db.native_parser = false;                                                                            // 138
  }                                                                                                                   // 139
                                                                                                                      // 140
  // XXX maybe we should have a better way of allowing users to configure the                                         // 141
  // underlying Mongo driver                                                                                          // 142
  if (_.has(options, 'poolSize')) {                                                                                   // 143
    // If we just set this for "server", replSet will override it. If we just                                         // 144
    // set it for replSet, it will be ignored if we're not using a replSet.                                           // 145
    mongoOptions.server.poolSize = options.poolSize;                                                                  // 146
    mongoOptions.replSet.poolSize = options.poolSize;                                                                 // 147
  }                                                                                                                   // 148
                                                                                                                      // 149
  self.db = null;                                                                                                     // 150
  // We keep track of the ReplSet's primary, so that we can trigger hooks when                                        // 151
  // it changes.  The Node driver's joined callback seems to fire way too                                             // 152
  // often, which is why we need to track it ourselves.                                                               // 153
  self._primary = null;                                                                                               // 154
  self._oplogHandle = null;                                                                                           // 155
  self._docFetcher = null;                                                                                            // 156
                                                                                                                      // 157
                                                                                                                      // 158
  var connectFuture = new Future;                                                                                     // 159
  MongoDB.connect(                                                                                                    // 160
    url,                                                                                                              // 161
    mongoOptions,                                                                                                     // 162
    Meteor.bindEnvironment(                                                                                           // 163
      function (err, db) {                                                                                            // 164
        if (err) {                                                                                                    // 165
          throw err;                                                                                                  // 166
        }                                                                                                             // 167
                                                                                                                      // 168
        // First, figure out what the current primary is, if any.                                                     // 169
        if (db.serverConfig._state.master)                                                                            // 170
          self._primary = db.serverConfig._state.master.name;                                                         // 171
        db.serverConfig.on(                                                                                           // 172
          'joined', Meteor.bindEnvironment(function (kind, doc) {                                                     // 173
            if (kind === 'primary') {                                                                                 // 174
              if (doc.primary !== self._primary) {                                                                    // 175
                self._primary = doc.primary;                                                                          // 176
                self._onFailoverHook.each(function (callback) {                                                       // 177
                  callback();                                                                                         // 178
                  return true;                                                                                        // 179
                });                                                                                                   // 180
              }                                                                                                       // 181
            } else if (doc.me === self._primary) {                                                                    // 182
              // The thing we thought was primary is now something other than                                         // 183
              // primary.  Forget that we thought it was primary.  (This means                                        // 184
              // that if a server stops being primary and then starts being                                           // 185
              // primary again without another server becoming primary in the                                         // 186
              // middle, we'll correctly count it as a failover.)                                                     // 187
              self._primary = null;                                                                                   // 188
            }                                                                                                         // 189
          }));                                                                                                        // 190
                                                                                                                      // 191
        // Allow the constructor to return.                                                                           // 192
        connectFuture['return'](db);                                                                                  // 193
      },                                                                                                              // 194
      connectFuture.resolver()  // onException                                                                        // 195
    )                                                                                                                 // 196
  );                                                                                                                  // 197
                                                                                                                      // 198
  // Wait for the connection to be successful; throws on failure.                                                     // 199
  self.db = connectFuture.wait();                                                                                     // 200
                                                                                                                      // 201
  if (options.oplogUrl && ! Package['disable-oplog']) {                                                               // 202
    self._oplogHandle = new OplogHandle(options.oplogUrl, self.db.databaseName);                                      // 203
    self._docFetcher = new DocFetcher(self);                                                                          // 204
  }                                                                                                                   // 205
};                                                                                                                    // 206
                                                                                                                      // 207
MongoConnection.prototype.close = function() {                                                                        // 208
  var self = this;                                                                                                    // 209
                                                                                                                      // 210
  if (! self.db)                                                                                                      // 211
    throw Error("close called before Connection created?");                                                           // 212
                                                                                                                      // 213
  // XXX probably untested                                                                                            // 214
  var oplogHandle = self._oplogHandle;                                                                                // 215
  self._oplogHandle = null;                                                                                           // 216
  if (oplogHandle)                                                                                                    // 217
    oplogHandle.stop();                                                                                               // 218
                                                                                                                      // 219
  // Use Future.wrap so that errors get thrown. This happens to                                                       // 220
  // work even outside a fiber since the 'close' method is not                                                        // 221
  // actually asynchronous.                                                                                           // 222
  Future.wrap(_.bind(self.db.close, self.db))(true).wait();                                                           // 223
};                                                                                                                    // 224
                                                                                                                      // 225
// Returns the Mongo Collection object; may yield.                                                                    // 226
MongoConnection.prototype._getCollection = function (collectionName) {                                                // 227
  var self = this;                                                                                                    // 228
                                                                                                                      // 229
  if (! self.db)                                                                                                      // 230
    throw Error("_getCollection called before Connection created?");                                                  // 231
                                                                                                                      // 232
  var future = new Future;                                                                                            // 233
  self.db.collection(collectionName, future.resolver());                                                              // 234
  return future.wait();                                                                                               // 235
};                                                                                                                    // 236
                                                                                                                      // 237
MongoConnection.prototype._createCappedCollection = function (                                                        // 238
    collectionName, byteSize, maxDocuments) {                                                                         // 239
  var self = this;                                                                                                    // 240
                                                                                                                      // 241
  if (! self.db)                                                                                                      // 242
    throw Error("_createCappedCollection called before Connection created?");                                         // 243
                                                                                                                      // 244
  var future = new Future();                                                                                          // 245
  self.db.createCollection(                                                                                           // 246
    collectionName,                                                                                                   // 247
    { capped: true, size: byteSize, max: maxDocuments },                                                              // 248
    future.resolver());                                                                                               // 249
  future.wait();                                                                                                      // 250
};                                                                                                                    // 251
                                                                                                                      // 252
// This should be called synchronously with a write, to create a                                                      // 253
// transaction on the current write fence, if any. After we can read                                                  // 254
// the write, and after observers have been notified (or at least,                                                    // 255
// after the observer notifiers have added themselves to the write                                                    // 256
// fence), you should call 'committed()' on the object returned.                                                      // 257
MongoConnection.prototype._maybeBeginWrite = function () {                                                            // 258
  var self = this;                                                                                                    // 259
  var fence = DDPServer._CurrentWriteFence.get();                                                                     // 260
  if (fence)                                                                                                          // 261
    return fence.beginWrite();                                                                                        // 262
  else                                                                                                                // 263
    return {committed: function () {}};                                                                               // 264
};                                                                                                                    // 265
                                                                                                                      // 266
// Internal interface: adds a callback which is called when the Mongo primary                                         // 267
// changes. Returns a stop handle.                                                                                    // 268
MongoConnection.prototype._onFailover = function (callback) {                                                         // 269
  return this._onFailoverHook.register(callback);                                                                     // 270
};                                                                                                                    // 271
                                                                                                                      // 272
                                                                                                                      // 273
//////////// Public API //////////                                                                                    // 274
                                                                                                                      // 275
// The write methods block until the database has confirmed the write (it may                                         // 276
// not be replicated or stable on disk, but one server has confirmed it) if no                                        // 277
// callback is provided. If a callback is provided, then they call the callback                                       // 278
// when the write is confirmed. They return nothing on success, and raise an                                          // 279
// exception on failure.                                                                                              // 280
//                                                                                                                    // 281
// After making a write (with insert, update, remove), observers are                                                  // 282
// notified asynchronously. If you want to receive a callback once all                                                // 283
// of the observer notifications have landed for your write, do the                                                   // 284
// writes inside a write fence (set DDPServer._CurrentWriteFence to a new                                             // 285
// _WriteFence, and then set a callback on the write fence.)                                                          // 286
//                                                                                                                    // 287
// Since our execution environment is single-threaded, this is                                                        // 288
// well-defined -- a write "has been made" if it's returned, and an                                                   // 289
// observer "has been notified" if its callback has returned.                                                         // 290
                                                                                                                      // 291
var writeCallback = function (write, refresh, callback) {                                                             // 292
  return function (err, result) {                                                                                     // 293
    if (! err) {                                                                                                      // 294
      // XXX We don't have to run this on error, right?                                                               // 295
      refresh();                                                                                                      // 296
    }                                                                                                                 // 297
    write.committed();                                                                                                // 298
    if (callback)                                                                                                     // 299
      callback(err, result);                                                                                          // 300
    else if (err)                                                                                                     // 301
      throw err;                                                                                                      // 302
  };                                                                                                                  // 303
};                                                                                                                    // 304
                                                                                                                      // 305
var bindEnvironmentForWrite = function (callback) {                                                                   // 306
  return Meteor.bindEnvironment(callback, "Mongo write");                                                             // 307
};                                                                                                                    // 308
                                                                                                                      // 309
MongoConnection.prototype._insert = function (collection_name, document,                                              // 310
                                              callback) {                                                             // 311
  var self = this;                                                                                                    // 312
                                                                                                                      // 313
  var sendError = function (e) {                                                                                      // 314
    if (callback)                                                                                                     // 315
      return callback(e);                                                                                             // 316
    throw e;                                                                                                          // 317
  };                                                                                                                  // 318
                                                                                                                      // 319
  if (collection_name === "___meteor_failure_test_collection") {                                                      // 320
    var e = new Error("Failure test");                                                                                // 321
    e.expected = true;                                                                                                // 322
    sendError(e);                                                                                                     // 323
    return;                                                                                                           // 324
  }                                                                                                                   // 325
                                                                                                                      // 326
  if (!(LocalCollection._isPlainObject(document) &&                                                                   // 327
        !EJSON._isCustomType(document))) {                                                                            // 328
    sendError(new Error(                                                                                              // 329
      "Only plain objects may be inserted into MongoDB"));                                                            // 330
    return;                                                                                                           // 331
  }                                                                                                                   // 332
                                                                                                                      // 333
  var write = self._maybeBeginWrite();                                                                                // 334
  var refresh = function () {                                                                                         // 335
    Meteor.refresh({collection: collection_name, id: document._id });                                                 // 336
  };                                                                                                                  // 337
  callback = bindEnvironmentForWrite(writeCallback(write, refresh, callback));                                        // 338
  try {                                                                                                               // 339
    var collection = self._getCollection(collection_name);                                                            // 340
    collection.insert(replaceTypes(document, replaceMeteorAtomWithMongo),                                             // 341
                      {safe: true}, callback);                                                                        // 342
  } catch (e) {                                                                                                       // 343
    write.committed();                                                                                                // 344
    throw e;                                                                                                          // 345
  }                                                                                                                   // 346
};                                                                                                                    // 347
                                                                                                                      // 348
// Cause queries that may be affected by the selector to poll in this write                                           // 349
// fence.                                                                                                             // 350
MongoConnection.prototype._refresh = function (collectionName, selector) {                                            // 351
  var self = this;                                                                                                    // 352
  var refreshKey = {collection: collectionName};                                                                      // 353
  // If we know which documents we're removing, don't poll queries that are                                           // 354
  // specific to other documents. (Note that multiple notifications here should                                       // 355
  // not cause multiple polls, since all our listener is doing is enqueueing a                                        // 356
  // poll.)                                                                                                           // 357
  var specificIds = LocalCollection._idsMatchedBySelector(selector);                                                  // 358
  if (specificIds) {                                                                                                  // 359
    _.each(specificIds, function (id) {                                                                               // 360
      Meteor.refresh(_.extend({id: id}, refreshKey));                                                                 // 361
    });                                                                                                               // 362
  } else {                                                                                                            // 363
    Meteor.refresh(refreshKey);                                                                                       // 364
  }                                                                                                                   // 365
};                                                                                                                    // 366
                                                                                                                      // 367
MongoConnection.prototype._remove = function (collection_name, selector,                                              // 368
                                              callback) {                                                             // 369
  var self = this;                                                                                                    // 370
                                                                                                                      // 371
  if (collection_name === "___meteor_failure_test_collection") {                                                      // 372
    var e = new Error("Failure test");                                                                                // 373
    e.expected = true;                                                                                                // 374
    if (callback)                                                                                                     // 375
      return callback(e);                                                                                             // 376
    else                                                                                                              // 377
      throw e;                                                                                                        // 378
  }                                                                                                                   // 379
                                                                                                                      // 380
  var write = self._maybeBeginWrite();                                                                                // 381
  var refresh = function () {                                                                                         // 382
    self._refresh(collection_name, selector);                                                                         // 383
  };                                                                                                                  // 384
  callback = bindEnvironmentForWrite(writeCallback(write, refresh, callback));                                        // 385
                                                                                                                      // 386
  try {                                                                                                               // 387
    var collection = self._getCollection(collection_name);                                                            // 388
    collection.remove(replaceTypes(selector, replaceMeteorAtomWithMongo),                                             // 389
                      {safe: true}, callback);                                                                        // 390
  } catch (e) {                                                                                                       // 391
    write.committed();                                                                                                // 392
    throw e;                                                                                                          // 393
  }                                                                                                                   // 394
};                                                                                                                    // 395
                                                                                                                      // 396
MongoConnection.prototype._dropCollection = function (collectionName, cb) {                                           // 397
  var self = this;                                                                                                    // 398
                                                                                                                      // 399
  var write = self._maybeBeginWrite();                                                                                // 400
  var refresh = function () {                                                                                         // 401
    Meteor.refresh({collection: collectionName, id: null,                                                             // 402
                    dropCollection: true});                                                                           // 403
  };                                                                                                                  // 404
  cb = bindEnvironmentForWrite(writeCallback(write, refresh, cb));                                                    // 405
                                                                                                                      // 406
  try {                                                                                                               // 407
    var collection = self._getCollection(collectionName);                                                             // 408
    collection.drop(cb);                                                                                              // 409
  } catch (e) {                                                                                                       // 410
    write.committed();                                                                                                // 411
    throw e;                                                                                                          // 412
  }                                                                                                                   // 413
};                                                                                                                    // 414
                                                                                                                      // 415
MongoConnection.prototype._update = function (collection_name, selector, mod,                                         // 416
                                              options, callback) {                                                    // 417
  var self = this;                                                                                                    // 418
                                                                                                                      // 419
  if (! callback && options instanceof Function) {                                                                    // 420
    callback = options;                                                                                               // 421
    options = null;                                                                                                   // 422
  }                                                                                                                   // 423
                                                                                                                      // 424
  if (collection_name === "___meteor_failure_test_collection") {                                                      // 425
    var e = new Error("Failure test");                                                                                // 426
    e.expected = true;                                                                                                // 427
    if (callback)                                                                                                     // 428
      return callback(e);                                                                                             // 429
    else                                                                                                              // 430
      throw e;                                                                                                        // 431
  }                                                                                                                   // 432
                                                                                                                      // 433
  // explicit safety check. null and undefined can crash the mongo                                                    // 434
  // driver. Although the node driver and minimongo do 'support'                                                      // 435
  // non-object modifier in that they don't crash, they are not                                                       // 436
  // meaningful operations and do not do anything. Defensively throw an                                               // 437
  // error here.                                                                                                      // 438
  if (!mod || typeof mod !== 'object')                                                                                // 439
    throw new Error("Invalid modifier. Modifier must be an object.");                                                 // 440
                                                                                                                      // 441
  if (!(LocalCollection._isPlainObject(mod) &&                                                                        // 442
        !EJSON._isCustomType(mod))) {                                                                                 // 443
    throw new Error(                                                                                                  // 444
      "Only plain objects may be used as replacement" +                                                               // 445
        " documents in MongoDB");                                                                                     // 446
    return;                                                                                                           // 447
  }                                                                                                                   // 448
                                                                                                                      // 449
  if (!options) options = {};                                                                                         // 450
                                                                                                                      // 451
  var write = self._maybeBeginWrite();                                                                                // 452
  var refresh = function () {                                                                                         // 453
    self._refresh(collection_name, selector);                                                                         // 454
  };                                                                                                                  // 455
  callback = writeCallback(write, refresh, callback);                                                                 // 456
  try {                                                                                                               // 457
    var collection = self._getCollection(collection_name);                                                            // 458
    var mongoOpts = {safe: true};                                                                                     // 459
    // explictly enumerate options that minimongo supports                                                            // 460
    if (options.upsert) mongoOpts.upsert = true;                                                                      // 461
    if (options.multi) mongoOpts.multi = true;                                                                        // 462
    // Lets you get a more more full result from MongoDB. Use with caution:                                           // 463
    // might not work with C.upsert (as opposed to C.update({upsert:true}) or                                         // 464
    // with simulated upsert.                                                                                         // 465
    if (options.fullResult) mongoOpts.fullResult = true;                                                              // 466
                                                                                                                      // 467
    var mongoSelector = replaceTypes(selector, replaceMeteorAtomWithMongo);                                           // 468
    var mongoMod = replaceTypes(mod, replaceMeteorAtomWithMongo);                                                     // 469
                                                                                                                      // 470
    var isModify = isModificationMod(mongoMod);                                                                       // 471
    var knownId = selector._id || mod._id;                                                                            // 472
                                                                                                                      // 473
    if (options._forbidReplace && ! isModify) {                                                                       // 474
      var e = new Error("Invalid modifier. Replacements are forbidden.");                                             // 475
      if (callback) {                                                                                                 // 476
        return callback(e);                                                                                           // 477
      } else {                                                                                                        // 478
        throw e;                                                                                                      // 479
      }                                                                                                               // 480
    }                                                                                                                 // 481
                                                                                                                      // 482
    if (options.upsert && (! knownId) && options.insertedId) {                                                        // 483
      // XXX If we know we're using Mongo 2.6 (and this isn't a replacement)                                          // 484
      //     we should be able to just use $setOnInsert instead of this                                               // 485
      //     simulated upsert thing. (We can't use $setOnInsert with                                                  // 486
      //     replacements because there's nowhere to write it, and $setOnInsert                                       // 487
      //     can't set _id on Mongo 2.4.)                                                                             // 488
      //                                                                                                              // 489
      //     Also, in the future we could do a real upsert for the mongo id                                           // 490
      //     generation case, if the the node mongo driver gives us back the id                                       // 491
      //     of the upserted doc (which our current version does not).                                                // 492
      //                                                                                                              // 493
      //     For more context, see                                                                                    // 494
      //     https://github.com/meteor/meteor/issues/2278#issuecomment-64252706                                       // 495
      simulateUpsertWithInsertedId(                                                                                   // 496
        collection, mongoSelector, mongoMod,                                                                          // 497
        isModify, options,                                                                                            // 498
        // This callback does not need to be bindEnvironment'ed because                                               // 499
        // simulateUpsertWithInsertedId() wraps it and then passes it through                                         // 500
        // bindEnvironmentForWrite.                                                                                   // 501
        function (err, result) {                                                                                      // 502
          // If we got here via a upsert() call, then options._returnObject will                                      // 503
          // be set and we should return the whole object. Otherwise, we should                                       // 504
          // just return the number of affected docs to match the mongo API.                                          // 505
          if (result && ! options._returnObject)                                                                      // 506
            callback(err, result.numberAffected);                                                                     // 507
          else                                                                                                        // 508
            callback(err, result);                                                                                    // 509
        }                                                                                                             // 510
      );                                                                                                              // 511
    } else {                                                                                                          // 512
      collection.update(                                                                                              // 513
        mongoSelector, mongoMod, mongoOpts,                                                                           // 514
        bindEnvironmentForWrite(function (err, result, extra) {                                                       // 515
          if (! err) {                                                                                                // 516
            if (result && options._returnObject) {                                                                    // 517
              result = { numberAffected: result };                                                                    // 518
              // If this was an upsert() call, and we ended up                                                        // 519
              // inserting a new doc and we know its id, then                                                         // 520
              // return that id as well.                                                                              // 521
              if (options.upsert && knownId &&                                                                        // 522
                  ! extra.updatedExisting)                                                                            // 523
                result.insertedId = knownId;                                                                          // 524
            }                                                                                                         // 525
          }                                                                                                           // 526
          callback(err, result);                                                                                      // 527
        }));                                                                                                          // 528
    }                                                                                                                 // 529
  } catch (e) {                                                                                                       // 530
    write.committed();                                                                                                // 531
    throw e;                                                                                                          // 532
  }                                                                                                                   // 533
};                                                                                                                    // 534
                                                                                                                      // 535
var isModificationMod = function (mod) {                                                                              // 536
  var isReplace = false;                                                                                              // 537
  var isModify = false;                                                                                               // 538
  for (var k in mod) {                                                                                                // 539
    if (k.substr(0, 1) === '$') {                                                                                     // 540
      isModify = true;                                                                                                // 541
    } else {                                                                                                          // 542
      isReplace = true;                                                                                               // 543
    }                                                                                                                 // 544
  }                                                                                                                   // 545
  if (isModify && isReplace) {                                                                                        // 546
    throw new Error(                                                                                                  // 547
      "Update parameter cannot have both modifier and non-modifier fields.");                                         // 548
  }                                                                                                                   // 549
  return isModify;                                                                                                    // 550
};                                                                                                                    // 551
                                                                                                                      // 552
var NUM_OPTIMISTIC_TRIES = 3;                                                                                         // 553
                                                                                                                      // 554
// exposed for testing                                                                                                // 555
MongoConnection._isCannotChangeIdError = function (err) {                                                             // 556
  // First check for what this error looked like in Mongo 2.4.  Either of these                                       // 557
  // checks should work, but just to be safe...                                                                       // 558
  if (err.code === 13596)                                                                                             // 559
    return true;                                                                                                      // 560
  if (err.err.indexOf("cannot change _id of a document") === 0)                                                       // 561
    return true;                                                                                                      // 562
                                                                                                                      // 563
  // Now look for what it looks like in Mongo 2.6.  We don't use the error code                                       // 564
  // here, because the error code we observed it producing (16837) appears to be                                      // 565
  // a far more generic error code based on examining the source.                                                     // 566
  if (err.err.indexOf("The _id field cannot be changed") === 0)                                                       // 567
    return true;                                                                                                      // 568
                                                                                                                      // 569
  return false;                                                                                                       // 570
};                                                                                                                    // 571
                                                                                                                      // 572
var simulateUpsertWithInsertedId = function (collection, selector, mod,                                               // 573
                                             isModify, options, callback) {                                           // 574
  // STRATEGY:  First try doing a plain update.  If it affected 0 documents,                                          // 575
  // then without affecting the database, we know we should probably do an                                            // 576
  // insert.  We then do a *conditional* insert that will fail in the case                                            // 577
  // of a race condition.  This conditional insert is actually an                                                     // 578
  // upsert-replace with an _id, which will never successfully update an                                              // 579
  // existing document.  If this upsert fails with an error saying it                                                 // 580
  // couldn't change an existing _id, then we know an intervening write has                                           // 581
  // caused the query to match something.  We go back to step one and repeat.                                         // 582
  // Like all "optimistic write" schemes, we rely on the fact that it's                                               // 583
  // unlikely our writes will continue to be interfered with under normal                                             // 584
  // circumstances (though sufficiently heavy contention with writers                                                 // 585
  // disagreeing on the existence of an object will cause writes to fail                                              // 586
  // in theory).                                                                                                      // 587
                                                                                                                      // 588
  var newDoc;                                                                                                         // 589
  // Run this code up front so that it fails fast if someone uses                                                     // 590
  // a Mongo update operator we don't support.                                                                        // 591
  if (isModify) {                                                                                                     // 592
    // We've already run replaceTypes/replaceMeteorAtomWithMongo on                                                   // 593
    // selector and mod.  We assume it doesn't matter, as far as                                                      // 594
    // the behavior of modifiers is concerned, whether `_modify`                                                      // 595
    // is run on EJSON or on mongo-converted EJSON.                                                                   // 596
    var selectorDoc = LocalCollection._removeDollarOperators(selector);                                               // 597
    LocalCollection._modify(selectorDoc, mod, {isInsert: true});                                                      // 598
    newDoc = selectorDoc;                                                                                             // 599
  } else {                                                                                                            // 600
    newDoc = mod;                                                                                                     // 601
  }                                                                                                                   // 602
                                                                                                                      // 603
  var insertedId = options.insertedId; // must exist                                                                  // 604
  var mongoOptsForUpdate = {                                                                                          // 605
    safe: true,                                                                                                       // 606
    multi: options.multi                                                                                              // 607
  };                                                                                                                  // 608
  var mongoOptsForInsert = {                                                                                          // 609
    safe: true,                                                                                                       // 610
    upsert: true                                                                                                      // 611
  };                                                                                                                  // 612
                                                                                                                      // 613
  var tries = NUM_OPTIMISTIC_TRIES;                                                                                   // 614
                                                                                                                      // 615
  var doUpdate = function () {                                                                                        // 616
    tries--;                                                                                                          // 617
    if (! tries) {                                                                                                    // 618
      callback(new Error("Upsert failed after " + NUM_OPTIMISTIC_TRIES + " tries."));                                 // 619
    } else {                                                                                                          // 620
      collection.update(selector, mod, mongoOptsForUpdate,                                                            // 621
                        bindEnvironmentForWrite(function (err, result) {                                              // 622
                          if (err)                                                                                    // 623
                            callback(err);                                                                            // 624
                          else if (result)                                                                            // 625
                            callback(null, {                                                                          // 626
                              numberAffected: result                                                                  // 627
                            });                                                                                       // 628
                          else                                                                                        // 629
                            doConditionalInsert();                                                                    // 630
                        }));                                                                                          // 631
    }                                                                                                                 // 632
  };                                                                                                                  // 633
                                                                                                                      // 634
  var doConditionalInsert = function () {                                                                             // 635
    var replacementWithId = _.extend(                                                                                 // 636
      replaceTypes({_id: insertedId}, replaceMeteorAtomWithMongo),                                                    // 637
      newDoc);                                                                                                        // 638
    collection.update(selector, replacementWithId, mongoOptsForInsert,                                                // 639
                      bindEnvironmentForWrite(function (err, result) {                                                // 640
                        if (err) {                                                                                    // 641
                          // figure out if this is a                                                                  // 642
                          // "cannot change _id of document" error, and                                               // 643
                          // if so, try doUpdate() again, up to 3 times.                                              // 644
                          if (MongoConnection._isCannotChangeIdError(err)) {                                          // 645
                            doUpdate();                                                                               // 646
                          } else {                                                                                    // 647
                            callback(err);                                                                            // 648
                          }                                                                                           // 649
                        } else {                                                                                      // 650
                          callback(null, {                                                                            // 651
                            numberAffected: result,                                                                   // 652
                            insertedId: insertedId                                                                    // 653
                          });                                                                                         // 654
                        }                                                                                             // 655
                      }));                                                                                            // 656
  };                                                                                                                  // 657
                                                                                                                      // 658
  doUpdate();                                                                                                         // 659
};                                                                                                                    // 660
                                                                                                                      // 661
_.each(["insert", "update", "remove", "dropCollection"], function (method) {                                          // 662
  MongoConnection.prototype[method] = function (/* arguments */) {                                                    // 663
    var self = this;                                                                                                  // 664
    return Meteor.wrapAsync(self["_" + method]).apply(self, arguments);                                               // 665
  };                                                                                                                  // 666
});                                                                                                                   // 667
                                                                                                                      // 668
// XXX MongoConnection.upsert() does not return the id of the inserted document                                       // 669
// unless you set it explicitly in the selector or modifier (as a replacement                                         // 670
// doc).                                                                                                              // 671
MongoConnection.prototype.upsert = function (collectionName, selector, mod,                                           // 672
                                             options, callback) {                                                     // 673
  var self = this;                                                                                                    // 674
  if (typeof options === "function" && ! callback) {                                                                  // 675
    callback = options;                                                                                               // 676
    options = {};                                                                                                     // 677
  }                                                                                                                   // 678
                                                                                                                      // 679
  return self.update(collectionName, selector, mod,                                                                   // 680
                     _.extend({}, options, {                                                                          // 681
                       upsert: true,                                                                                  // 682
                       _returnObject: true                                                                            // 683
                     }), callback);                                                                                   // 684
};                                                                                                                    // 685
                                                                                                                      // 686
MongoConnection.prototype.find = function (collectionName, selector, options) {                                       // 687
  var self = this;                                                                                                    // 688
                                                                                                                      // 689
  if (arguments.length === 1)                                                                                         // 690
    selector = {};                                                                                                    // 691
                                                                                                                      // 692
  return new Cursor(                                                                                                  // 693
    self, new CursorDescription(collectionName, selector, options));                                                  // 694
};                                                                                                                    // 695
                                                                                                                      // 696
MongoConnection.prototype.findOne = function (collection_name, selector,                                              // 697
                                              options) {                                                              // 698
  var self = this;                                                                                                    // 699
  if (arguments.length === 1)                                                                                         // 700
    selector = {};                                                                                                    // 701
                                                                                                                      // 702
  options = options || {};                                                                                            // 703
  options.limit = 1;                                                                                                  // 704
  return self.find(collection_name, selector, options).fetch()[0];                                                    // 705
};                                                                                                                    // 706
                                                                                                                      // 707
// We'll actually design an index API later. For now, we just pass through to                                         // 708
// Mongo's, but make it synchronous.                                                                                  // 709
MongoConnection.prototype._ensureIndex = function (collectionName, index,                                             // 710
                                                   options) {                                                         // 711
  var self = this;                                                                                                    // 712
  options = _.extend({safe: true}, options);                                                                          // 713
                                                                                                                      // 714
  // We expect this function to be called at startup, not from within a method,                                       // 715
  // so we don't interact with the write fence.                                                                       // 716
  var collection = self._getCollection(collectionName);                                                               // 717
  var future = new Future;                                                                                            // 718
  var indexName = collection.ensureIndex(index, options, future.resolver());                                          // 719
  future.wait();                                                                                                      // 720
};                                                                                                                    // 721
MongoConnection.prototype._dropIndex = function (collectionName, index) {                                             // 722
  var self = this;                                                                                                    // 723
                                                                                                                      // 724
  // This function is only used by test code, not within a method, so we don't                                        // 725
  // interact with the write fence.                                                                                   // 726
  var collection = self._getCollection(collectionName);                                                               // 727
  var future = new Future;                                                                                            // 728
  var indexName = collection.dropIndex(index, future.resolver());                                                     // 729
  future.wait();                                                                                                      // 730
};                                                                                                                    // 731
                                                                                                                      // 732
// CURSORS                                                                                                            // 733
                                                                                                                      // 734
// There are several classes which relate to cursors:                                                                 // 735
//                                                                                                                    // 736
// CursorDescription represents the arguments used to construct a cursor:                                             // 737
// collectionName, selector, and (find) options.  Because it is used as a key                                         // 738
// for cursor de-dup, everything in it should either be JSON-stringifiable or                                         // 739
// not affect observeChanges output (eg, options.transform functions are not                                          // 740
// stringifiable but do not affect observeChanges).                                                                   // 741
//                                                                                                                    // 742
// SynchronousCursor is a wrapper around a MongoDB cursor                                                             // 743
// which includes fully-synchronous versions of forEach, etc.                                                         // 744
//                                                                                                                    // 745
// Cursor is the cursor object returned from find(), which implements the                                             // 746
// documented Mongo.Collection cursor API.  It wraps a CursorDescription and a                                        // 747
// SynchronousCursor (lazily: it doesn't contact Mongo until you call a method                                        // 748
// like fetch or forEach on it).                                                                                      // 749
//                                                                                                                    // 750
// ObserveHandle is the "observe handle" returned from observeChanges. It has a                                       // 751
// reference to an ObserveMultiplexer.                                                                                // 752
//                                                                                                                    // 753
// ObserveMultiplexer allows multiple identical ObserveHandles to be driven by a                                      // 754
// single observe driver.                                                                                             // 755
//                                                                                                                    // 756
// There are two "observe drivers" which drive ObserveMultiplexers:                                                   // 757
//   - PollingObserveDriver caches the results of a query and reruns it when                                          // 758
//     necessary.                                                                                                     // 759
//   - OplogObserveDriver follows the Mongo operation log to directly observe                                         // 760
//     database changes.                                                                                              // 761
// Both implementations follow the same simple interface: when you create them,                                       // 762
// they start sending observeChanges callbacks (and a ready() invocation) to                                          // 763
// their ObserveMultiplexer, and you stop them by calling their stop() method.                                        // 764
                                                                                                                      // 765
CursorDescription = function (collectionName, selector, options) {                                                    // 766
  var self = this;                                                                                                    // 767
  self.collectionName = collectionName;                                                                               // 768
  self.selector = Mongo.Collection._rewriteSelector(selector);                                                        // 769
  self.options = options || {};                                                                                       // 770
};                                                                                                                    // 771
                                                                                                                      // 772
Cursor = function (mongo, cursorDescription) {                                                                        // 773
  var self = this;                                                                                                    // 774
                                                                                                                      // 775
  self._mongo = mongo;                                                                                                // 776
  self._cursorDescription = cursorDescription;                                                                        // 777
  self._synchronousCursor = null;                                                                                     // 778
};                                                                                                                    // 779
                                                                                                                      // 780
_.each(['forEach', 'map', 'fetch', 'count'], function (method) {                                                      // 781
  Cursor.prototype[method] = function () {                                                                            // 782
    var self = this;                                                                                                  // 783
                                                                                                                      // 784
    // You can only observe a tailable cursor.                                                                        // 785
    if (self._cursorDescription.options.tailable)                                                                     // 786
      throw new Error("Cannot call " + method + " on a tailable cursor");                                             // 787
                                                                                                                      // 788
    if (!self._synchronousCursor) {                                                                                   // 789
      self._synchronousCursor = self._mongo._createSynchronousCursor(                                                 // 790
        self._cursorDescription, {                                                                                    // 791
          // Make sure that the "self" argument to forEach/map callbacks is the                                       // 792
          // Cursor, not the SynchronousCursor.                                                                       // 793
          selfForIteration: self,                                                                                     // 794
          useTransform: true                                                                                          // 795
        });                                                                                                           // 796
    }                                                                                                                 // 797
                                                                                                                      // 798
    return self._synchronousCursor[method].apply(                                                                     // 799
      self._synchronousCursor, arguments);                                                                            // 800
  };                                                                                                                  // 801
});                                                                                                                   // 802
                                                                                                                      // 803
// Since we don't actually have a "nextObject" interface, there's really no                                           // 804
// reason to have a "rewind" interface.  All it did was make multiple calls                                           // 805
// to fetch/map/forEach return nothing the second time.                                                               // 806
// XXX COMPAT WITH 0.8.1                                                                                              // 807
Cursor.prototype.rewind = function () {                                                                               // 808
};                                                                                                                    // 809
                                                                                                                      // 810
Cursor.prototype.getTransform = function () {                                                                         // 811
  return this._cursorDescription.options.transform;                                                                   // 812
};                                                                                                                    // 813
                                                                                                                      // 814
// When you call Meteor.publish() with a function that returns a Cursor, we need                                      // 815
// to transmute it into the equivalent subscription.  This is the function that                                       // 816
// does that.                                                                                                         // 817
                                                                                                                      // 818
Cursor.prototype._publishCursor = function (sub) {                                                                    // 819
  var self = this;                                                                                                    // 820
  var collection = self._cursorDescription.collectionName;                                                            // 821
  return Mongo.Collection._publishCursor(self, sub, collection);                                                      // 822
};                                                                                                                    // 823
                                                                                                                      // 824
// Used to guarantee that publish functions return at most one cursor per                                             // 825
// collection. Private, because we might later have cursors that include                                              // 826
// documents from multiple collections somehow.                                                                       // 827
Cursor.prototype._getCollectionName = function () {                                                                   // 828
  var self = this;                                                                                                    // 829
  return self._cursorDescription.collectionName;                                                                      // 830
}                                                                                                                     // 831
                                                                                                                      // 832
Cursor.prototype.observe = function (callbacks) {                                                                     // 833
  var self = this;                                                                                                    // 834
  return LocalCollection._observeFromObserveChanges(self, callbacks);                                                 // 835
};                                                                                                                    // 836
                                                                                                                      // 837
Cursor.prototype.observeChanges = function (callbacks) {                                                              // 838
  var self = this;                                                                                                    // 839
  var ordered = LocalCollection._observeChangesCallbacksAreOrdered(callbacks);                                        // 840
  return self._mongo._observeChanges(                                                                                 // 841
    self._cursorDescription, ordered, callbacks);                                                                     // 842
};                                                                                                                    // 843
                                                                                                                      // 844
MongoConnection.prototype._createSynchronousCursor = function(                                                        // 845
    cursorDescription, options) {                                                                                     // 846
  var self = this;                                                                                                    // 847
  options = _.pick(options || {}, 'selfForIteration', 'useTransform');                                                // 848
                                                                                                                      // 849
  var collection = self._getCollection(cursorDescription.collectionName);                                             // 850
  var cursorOptions = cursorDescription.options;                                                                      // 851
  var mongoOptions = {                                                                                                // 852
    sort: cursorOptions.sort,                                                                                         // 853
    limit: cursorOptions.limit,                                                                                       // 854
    skip: cursorOptions.skip                                                                                          // 855
  };                                                                                                                  // 856
                                                                                                                      // 857
  // Do we want a tailable cursor (which only works on capped collections)?                                           // 858
  if (cursorOptions.tailable) {                                                                                       // 859
    // We want a tailable cursor...                                                                                   // 860
    mongoOptions.tailable = true;                                                                                     // 861
    // ... and for the server to wait a bit if any getMore has no data (rather                                        // 862
    // than making us put the relevant sleeps in the client)...                                                       // 863
    mongoOptions.awaitdata = true;                                                                                    // 864
    // ... and to keep querying the server indefinitely rather than just 5 times                                      // 865
    // if there's no more data.                                                                                       // 866
    mongoOptions.numberOfRetries = -1;                                                                                // 867
    // And if this is on the oplog collection and the cursor specifies a 'ts',                                        // 868
    // then set the undocumented oplog replay flag, which does a special scan to                                      // 869
    // find the first document (instead of creating an index on ts). This is a                                        // 870
    // very hard-coded Mongo flag which only works on the oplog collection and                                        // 871
    // only works with the ts field.                                                                                  // 872
    if (cursorDescription.collectionName === OPLOG_COLLECTION &&                                                      // 873
        cursorDescription.selector.ts) {                                                                              // 874
      mongoOptions.oplogReplay = true;                                                                                // 875
    }                                                                                                                 // 876
  }                                                                                                                   // 877
                                                                                                                      // 878
  var dbCursor = collection.find(                                                                                     // 879
    replaceTypes(cursorDescription.selector, replaceMeteorAtomWithMongo),                                             // 880
    cursorOptions.fields, mongoOptions);                                                                              // 881
                                                                                                                      // 882
  return new SynchronousCursor(dbCursor, cursorDescription, options);                                                 // 883
};                                                                                                                    // 884
                                                                                                                      // 885
var SynchronousCursor = function (dbCursor, cursorDescription, options) {                                             // 886
  var self = this;                                                                                                    // 887
  options = _.pick(options || {}, 'selfForIteration', 'useTransform');                                                // 888
                                                                                                                      // 889
  self._dbCursor = dbCursor;                                                                                          // 890
  self._cursorDescription = cursorDescription;                                                                        // 891
  // The "self" argument passed to forEach/map callbacks. If we're wrapped                                            // 892
  // inside a user-visible Cursor, we want to provide the outer cursor!                                               // 893
  self._selfForIteration = options.selfForIteration || self;                                                          // 894
  if (options.useTransform && cursorDescription.options.transform) {                                                  // 895
    self._transform = LocalCollection.wrapTransform(                                                                  // 896
      cursorDescription.options.transform);                                                                           // 897
  } else {                                                                                                            // 898
    self._transform = null;                                                                                           // 899
  }                                                                                                                   // 900
                                                                                                                      // 901
  // Need to specify that the callback is the first argument to nextObject,                                           // 902
  // since otherwise when we try to call it with no args the driver will                                              // 903
  // interpret "undefined" first arg as an options hash and crash.                                                    // 904
  self._synchronousNextObject = Future.wrap(                                                                          // 905
    dbCursor.nextObject.bind(dbCursor), 0);                                                                           // 906
  self._synchronousCount = Future.wrap(dbCursor.count.bind(dbCursor));                                                // 907
  self._visitedIds = new LocalCollection._IdMap;                                                                      // 908
};                                                                                                                    // 909
                                                                                                                      // 910
_.extend(SynchronousCursor.prototype, {                                                                               // 911
  _nextObject: function () {                                                                                          // 912
    var self = this;                                                                                                  // 913
                                                                                                                      // 914
    while (true) {                                                                                                    // 915
      var doc = self._synchronousNextObject().wait();                                                                 // 916
                                                                                                                      // 917
      if (!doc) return null;                                                                                          // 918
      doc = replaceTypes(doc, replaceMongoAtomWithMeteor);                                                            // 919
                                                                                                                      // 920
      if (!self._cursorDescription.options.tailable && _.has(doc, '_id')) {                                           // 921
        // Did Mongo give us duplicate documents in the same cursor? If so,                                           // 922
        // ignore this one. (Do this before the transform, since transform might                                      // 923
        // return some unrelated value.) We don't do this for tailable cursors,                                       // 924
        // because we want to maintain O(1) memory usage. And if there isn't _id                                      // 925
        // for some reason (maybe it's the oplog), then we don't do this either.                                      // 926
        // (Be careful to do this for falsey but existing _id, though.)                                               // 927
        if (self._visitedIds.has(doc._id)) continue;                                                                  // 928
        self._visitedIds.set(doc._id, true);                                                                          // 929
      }                                                                                                               // 930
                                                                                                                      // 931
      if (self._transform)                                                                                            // 932
        doc = self._transform(doc);                                                                                   // 933
                                                                                                                      // 934
      return doc;                                                                                                     // 935
    }                                                                                                                 // 936
  },                                                                                                                  // 937
                                                                                                                      // 938
  forEach: function (callback, thisArg) {                                                                             // 939
    var self = this;                                                                                                  // 940
                                                                                                                      // 941
    // Get back to the beginning.                                                                                     // 942
    self._rewind();                                                                                                   // 943
                                                                                                                      // 944
    // We implement the loop ourself instead of using self._dbCursor.each,                                            // 945
    // because "each" will call its callback outside of a fiber which makes it                                        // 946
    // much more complex to make this function synchronous.                                                           // 947
    var index = 0;                                                                                                    // 948
    while (true) {                                                                                                    // 949
      var doc = self._nextObject();                                                                                   // 950
      if (!doc) return;                                                                                               // 951
      callback.call(thisArg, doc, index++, self._selfForIteration);                                                   // 952
    }                                                                                                                 // 953
  },                                                                                                                  // 954
                                                                                                                      // 955
  // XXX Allow overlapping callback executions if callback yields.                                                    // 956
  map: function (callback, thisArg) {                                                                                 // 957
    var self = this;                                                                                                  // 958
    var res = [];                                                                                                     // 959
    self.forEach(function (doc, index) {                                                                              // 960
      res.push(callback.call(thisArg, doc, index, self._selfForIteration));                                           // 961
    });                                                                                                               // 962
    return res;                                                                                                       // 963
  },                                                                                                                  // 964
                                                                                                                      // 965
  _rewind: function () {                                                                                              // 966
    var self = this;                                                                                                  // 967
                                                                                                                      // 968
    // known to be synchronous                                                                                        // 969
    self._dbCursor.rewind();                                                                                          // 970
                                                                                                                      // 971
    self._visitedIds = new LocalCollection._IdMap;                                                                    // 972
  },                                                                                                                  // 973
                                                                                                                      // 974
  // Mostly usable for tailable cursors.                                                                              // 975
  close: function () {                                                                                                // 976
    var self = this;                                                                                                  // 977
                                                                                                                      // 978
    self._dbCursor.close();                                                                                           // 979
  },                                                                                                                  // 980
                                                                                                                      // 981
  fetch: function () {                                                                                                // 982
    var self = this;                                                                                                  // 983
    return self.map(_.identity);                                                                                      // 984
  },                                                                                                                  // 985
                                                                                                                      // 986
  count: function () {                                                                                                // 987
    var self = this;                                                                                                  // 988
    return self._synchronousCount().wait();                                                                           // 989
  },                                                                                                                  // 990
                                                                                                                      // 991
  // This method is NOT wrapped in Cursor.                                                                            // 992
  getRawObjects: function (ordered) {                                                                                 // 993
    var self = this;                                                                                                  // 994
    if (ordered) {                                                                                                    // 995
      return self.fetch();                                                                                            // 996
    } else {                                                                                                          // 997
      var results = new LocalCollection._IdMap;                                                                       // 998
      self.forEach(function (doc) {                                                                                   // 999
        results.set(doc._id, doc);                                                                                    // 1000
      });                                                                                                             // 1001
      return results;                                                                                                 // 1002
    }                                                                                                                 // 1003
  }                                                                                                                   // 1004
});                                                                                                                   // 1005
                                                                                                                      // 1006
MongoConnection.prototype.tail = function (cursorDescription, docCallback) {                                          // 1007
  var self = this;                                                                                                    // 1008
  if (!cursorDescription.options.tailable)                                                                            // 1009
    throw new Error("Can only tail a tailable cursor");                                                               // 1010
                                                                                                                      // 1011
  var cursor = self._createSynchronousCursor(cursorDescription);                                                      // 1012
                                                                                                                      // 1013
  var stopped = false;                                                                                                // 1014
  var lastTS = undefined;                                                                                             // 1015
  var loop = function () {                                                                                            // 1016
    while (true) {                                                                                                    // 1017
      if (stopped)                                                                                                    // 1018
        return;                                                                                                       // 1019
      try {                                                                                                           // 1020
        var doc = cursor._nextObject();                                                                               // 1021
      } catch (err) {                                                                                                 // 1022
        // There's no good way to figure out if this was actually an error                                            // 1023
        // from Mongo. Ah well. But either way, we need to retry the cursor                                           // 1024
        // (unless the failure was because the observe got stopped).                                                  // 1025
        doc = null;                                                                                                   // 1026
      }                                                                                                               // 1027
      // Since cursor._nextObject can yield, we need to check again to see if                                         // 1028
      // we've been stopped before calling the callback.                                                              // 1029
      if (stopped)                                                                                                    // 1030
        return;                                                                                                       // 1031
      if (doc) {                                                                                                      // 1032
        // If a tailable cursor contains a "ts" field, use it to recreate the                                         // 1033
        // cursor on error. ("ts" is a standard that Mongo uses internally for                                        // 1034
        // the oplog, and there's a special flag that lets you do binary search                                       // 1035
        // on it instead of needing to use an index.)                                                                 // 1036
        lastTS = doc.ts;                                                                                              // 1037
        docCallback(doc);                                                                                             // 1038
      } else {                                                                                                        // 1039
        var newSelector = _.clone(cursorDescription.selector);                                                        // 1040
        if (lastTS) {                                                                                                 // 1041
          newSelector.ts = {$gt: lastTS};                                                                             // 1042
        }                                                                                                             // 1043
        cursor = self._createSynchronousCursor(new CursorDescription(                                                 // 1044
          cursorDescription.collectionName,                                                                           // 1045
          newSelector,                                                                                                // 1046
          cursorDescription.options));                                                                                // 1047
        // Mongo failover takes many seconds.  Retry in a bit.  (Without this                                         // 1048
        // setTimeout, we peg the CPU at 100% and never notice the actual                                             // 1049
        // failover.                                                                                                  // 1050
        Meteor.setTimeout(loop, 100);                                                                                 // 1051
        break;                                                                                                        // 1052
      }                                                                                                               // 1053
    }                                                                                                                 // 1054
  };                                                                                                                  // 1055
                                                                                                                      // 1056
  Meteor.defer(loop);                                                                                                 // 1057
                                                                                                                      // 1058
  return {                                                                                                            // 1059
    stop: function () {                                                                                               // 1060
      stopped = true;                                                                                                 // 1061
      cursor.close();                                                                                                 // 1062
    }                                                                                                                 // 1063
  };                                                                                                                  // 1064
};                                                                                                                    // 1065
                                                                                                                      // 1066
MongoConnection.prototype._observeChanges = function (                                                                // 1067
    cursorDescription, ordered, callbacks) {                                                                          // 1068
  var self = this;                                                                                                    // 1069
                                                                                                                      // 1070
  if (cursorDescription.options.tailable) {                                                                           // 1071
    return self._observeChangesTailable(cursorDescription, ordered, callbacks);                                       // 1072
  }                                                                                                                   // 1073
                                                                                                                      // 1074
  // You may not filter out _id when observing changes, because the id is a core                                      // 1075
  // part of the observeChanges API.                                                                                  // 1076
  if (cursorDescription.options.fields &&                                                                             // 1077
      (cursorDescription.options.fields._id === 0 ||                                                                  // 1078
       cursorDescription.options.fields._id === false)) {                                                             // 1079
    throw Error("You may not observe a cursor with {fields: {_id: 0}}");                                              // 1080
  }                                                                                                                   // 1081
                                                                                                                      // 1082
  var observeKey = JSON.stringify(                                                                                    // 1083
    _.extend({ordered: ordered}, cursorDescription));                                                                 // 1084
                                                                                                                      // 1085
  var multiplexer, observeDriver;                                                                                     // 1086
  var firstHandle = false;                                                                                            // 1087
                                                                                                                      // 1088
  // Find a matching ObserveMultiplexer, or create a new one. This next block is                                      // 1089
  // guaranteed to not yield (and it doesn't call anything that can observe a                                         // 1090
  // new query), so no other calls to this function can interleave with it.                                           // 1091
  Meteor._noYieldsAllowed(function () {                                                                               // 1092
    if (_.has(self._observeMultiplexers, observeKey)) {                                                               // 1093
      multiplexer = self._observeMultiplexers[observeKey];                                                            // 1094
    } else {                                                                                                          // 1095
      firstHandle = true;                                                                                             // 1096
      // Create a new ObserveMultiplexer.                                                                             // 1097
      multiplexer = new ObserveMultiplexer({                                                                          // 1098
        ordered: ordered,                                                                                             // 1099
        onStop: function () {                                                                                         // 1100
          delete self._observeMultiplexers[observeKey];                                                               // 1101
          observeDriver.stop();                                                                                       // 1102
        }                                                                                                             // 1103
      });                                                                                                             // 1104
      self._observeMultiplexers[observeKey] = multiplexer;                                                            // 1105
    }                                                                                                                 // 1106
  });                                                                                                                 // 1107
                                                                                                                      // 1108
  var observeHandle = new ObserveHandle(multiplexer, callbacks);                                                      // 1109
                                                                                                                      // 1110
  if (firstHandle) {                                                                                                  // 1111
    var matcher, sorter;                                                                                              // 1112
    var canUseOplog = _.all([                                                                                         // 1113
      function () {                                                                                                   // 1114
        // At a bare minimum, using the oplog requires us to have an oplog, to                                        // 1115
        // want unordered callbacks, and to not want a callback on the polls                                          // 1116
        // that won't happen.                                                                                         // 1117
        return self._oplogHandle && !ordered &&                                                                       // 1118
          !callbacks._testOnlyPollCallback;                                                                           // 1119
      }, function () {                                                                                                // 1120
        // We need to be able to compile the selector. Fall back to polling for                                       // 1121
        // some newfangled $selector that minimongo doesn't support yet.                                              // 1122
        try {                                                                                                         // 1123
          matcher = new Minimongo.Matcher(cursorDescription.selector);                                                // 1124
          return true;                                                                                                // 1125
        } catch (e) {                                                                                                 // 1126
          // XXX make all compilation errors MinimongoError or something                                              // 1127
          //     so that this doesn't ignore unrelated exceptions                                                     // 1128
          return false;                                                                                               // 1129
        }                                                                                                             // 1130
      }, function () {                                                                                                // 1131
        // ... and the selector itself needs to support oplog.                                                        // 1132
        return OplogObserveDriver.cursorSupported(cursorDescription, matcher);                                        // 1133
      }, function () {                                                                                                // 1134
        // And we need to be able to compile the sort, if any.  eg, can't be                                          // 1135
        // {$natural: 1}.                                                                                             // 1136
        if (!cursorDescription.options.sort)                                                                          // 1137
          return true;                                                                                                // 1138
        try {                                                                                                         // 1139
          sorter = new Minimongo.Sorter(cursorDescription.options.sort,                                               // 1140
                                        { matcher: matcher });                                                        // 1141
          return true;                                                                                                // 1142
        } catch (e) {                                                                                                 // 1143
          // XXX make all compilation errors MinimongoError or something                                              // 1144
          //     so that this doesn't ignore unrelated exceptions                                                     // 1145
          return false;                                                                                               // 1146
        }                                                                                                             // 1147
      }], function (f) { return f(); });  // invoke each function                                                     // 1148
                                                                                                                      // 1149
    var driverClass = canUseOplog ? OplogObserveDriver : PollingObserveDriver;                                        // 1150
    observeDriver = new driverClass({                                                                                 // 1151
      cursorDescription: cursorDescription,                                                                           // 1152
      mongoHandle: self,                                                                                              // 1153
      multiplexer: multiplexer,                                                                                       // 1154
      ordered: ordered,                                                                                               // 1155
      matcher: matcher,  // ignored by polling                                                                        // 1156
      sorter: sorter,  // ignored by polling                                                                          // 1157
      _testOnlyPollCallback: callbacks._testOnlyPollCallback                                                          // 1158
    });                                                                                                               // 1159
                                                                                                                      // 1160
    // This field is only set for use in tests.                                                                       // 1161
    multiplexer._observeDriver = observeDriver;                                                                       // 1162
  }                                                                                                                   // 1163
                                                                                                                      // 1164
  // Blocks until the initial adds have been sent.                                                                    // 1165
  multiplexer.addHandleAndSendInitialAdds(observeHandle);                                                             // 1166
                                                                                                                      // 1167
  return observeHandle;                                                                                               // 1168
};                                                                                                                    // 1169
                                                                                                                      // 1170
// Listen for the invalidation messages that will trigger us to poll the                                              // 1171
// database for changes. If this selector specifies specific IDs, specify them                                        // 1172
// here, so that updates to different specific IDs don't cause us to poll.                                            // 1173
// listenCallback is the same kind of (notification, complete) callback passed                                        // 1174
// to InvalidationCrossbar.listen.                                                                                    // 1175
                                                                                                                      // 1176
listenAll = function (cursorDescription, listenCallback) {                                                            // 1177
  var listeners = [];                                                                                                 // 1178
  forEachTrigger(cursorDescription, function (trigger) {                                                              // 1179
    listeners.push(DDPServer._InvalidationCrossbar.listen(                                                            // 1180
      trigger, listenCallback));                                                                                      // 1181
  });                                                                                                                 // 1182
                                                                                                                      // 1183
  return {                                                                                                            // 1184
    stop: function () {                                                                                               // 1185
      _.each(listeners, function (listener) {                                                                         // 1186
        listener.stop();                                                                                              // 1187
      });                                                                                                             // 1188
    }                                                                                                                 // 1189
  };                                                                                                                  // 1190
};                                                                                                                    // 1191
                                                                                                                      // 1192
forEachTrigger = function (cursorDescription, triggerCallback) {                                                      // 1193
  var key = {collection: cursorDescription.collectionName};                                                           // 1194
  var specificIds = LocalCollection._idsMatchedBySelector(                                                            // 1195
    cursorDescription.selector);                                                                                      // 1196
  if (specificIds) {                                                                                                  // 1197
    _.each(specificIds, function (id) {                                                                               // 1198
      triggerCallback(_.extend({id: id}, key));                                                                       // 1199
    });                                                                                                               // 1200
    triggerCallback(_.extend({dropCollection: true, id: null}, key));                                                 // 1201
  } else {                                                                                                            // 1202
    triggerCallback(key);                                                                                             // 1203
  }                                                                                                                   // 1204
};                                                                                                                    // 1205
                                                                                                                      // 1206
// observeChanges for tailable cursors on capped collections.                                                         // 1207
//                                                                                                                    // 1208
// Some differences from normal cursors:                                                                              // 1209
//   - Will never produce anything other than 'added' or 'addedBefore'. If you                                        // 1210
//     do update a document that has already been produced, this will not notice                                      // 1211
//     it.                                                                                                            // 1212
//   - If you disconnect and reconnect from Mongo, it will essentially restart                                        // 1213
//     the query, which will lead to duplicate results. This is pretty bad,                                           // 1214
//     but if you include a field called 'ts' which is inserted as                                                    // 1215
//     new MongoInternals.MongoTimestamp(0, 0) (which is initialized to the                                           // 1216
//     current Mongo-style timestamp), we'll be able to find the place to                                             // 1217
//     restart properly. (This field is specifically understood by Mongo with an                                      // 1218
//     optimization which allows it to find the right place to start without                                          // 1219
//     an index on ts. It's how the oplog works.)                                                                     // 1220
//   - No callbacks are triggered synchronously with the call (there's no                                             // 1221
//     differentiation between "initial data" and "later changes"; everything                                         // 1222
//     that matches the query gets sent asynchronously).                                                              // 1223
//   - De-duplication is not implemented.                                                                             // 1224
//   - Does not yet interact with the write fence. Probably, this should work by                                      // 1225
//     ignoring removes (which don't work on capped collections) and updates                                          // 1226
//     (which don't affect tailable cursors), and just keeping track of the ID                                        // 1227
//     of the inserted object, and closing the write fence once you get to that                                       // 1228
//     ID (or timestamp?).  This doesn't work well if the document doesn't match                                      // 1229
//     the query, though.  On the other hand, the write fence can close                                               // 1230
//     immediately if it does not match the query. So if we trust minimongo                                           // 1231
//     enough to accurately evaluate the query against the write fence, we                                            // 1232
//     should be able to do this...  Of course, minimongo doesn't even support                                        // 1233
//     Mongo Timestamps yet.                                                                                          // 1234
MongoConnection.prototype._observeChangesTailable = function (                                                        // 1235
    cursorDescription, ordered, callbacks) {                                                                          // 1236
  var self = this;                                                                                                    // 1237
                                                                                                                      // 1238
  // Tailable cursors only ever call added/addedBefore callbacks, so it's an                                          // 1239
  // error if you didn't provide them.                                                                                // 1240
  if ((ordered && !callbacks.addedBefore) ||                                                                          // 1241
      (!ordered && !callbacks.added)) {                                                                               // 1242
    throw new Error("Can't observe an " + (ordered ? "ordered" : "unordered")                                         // 1243
                    + " tailable cursor without a "                                                                   // 1244
                    + (ordered ? "addedBefore" : "added") + " callback");                                             // 1245
  }                                                                                                                   // 1246
                                                                                                                      // 1247
  return self.tail(cursorDescription, function (doc) {                                                                // 1248
    var id = doc._id;                                                                                                 // 1249
    delete doc._id;                                                                                                   // 1250
    // The ts is an implementation detail. Hide it.                                                                   // 1251
    delete doc.ts;                                                                                                    // 1252
    if (ordered) {                                                                                                    // 1253
      callbacks.addedBefore(id, doc, null);                                                                           // 1254
    } else {                                                                                                          // 1255
      callbacks.added(id, doc);                                                                                       // 1256
    }                                                                                                                 // 1257
  });                                                                                                                 // 1258
};                                                                                                                    // 1259
                                                                                                                      // 1260
// XXX We probably need to find a better way to expose this. Right now                                                // 1261
// it's only used by tests, but in fact you need it in normal                                                         // 1262
// operation to interact with capped collections.                                                                     // 1263
MongoInternals.MongoTimestamp = MongoDB.Timestamp;                                                                    // 1264
                                                                                                                      // 1265
MongoInternals.Connection = MongoConnection;                                                                          // 1266
MongoInternals.NpmModule = MongoDB;                                                                                   // 1267
                                                                                                                      // 1268
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/mongo/oplog_tailing.js                                                                                    //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
var Future = Npm.require('fibers/future');                                                                            // 1
                                                                                                                      // 2
OPLOG_COLLECTION = 'oplog.rs';                                                                                        // 3
                                                                                                                      // 4
var TOO_FAR_BEHIND = process.env.METEOR_OPLOG_TOO_FAR_BEHIND || 2000;                                                 // 5
                                                                                                                      // 6
// Like Perl's quotemeta: quotes all regexp metacharacters. See                                                       // 7
//   https://github.com/substack/quotemeta/blob/master/index.js                                                       // 8
// XXX this is duplicated with accounts_server.js                                                                     // 9
var quotemeta = function (str) {                                                                                      // 10
    return String(str).replace(/(\W)/g, '\\$1');                                                                      // 11
};                                                                                                                    // 12
                                                                                                                      // 13
var showTS = function (ts) {                                                                                          // 14
  return "Timestamp(" + ts.getHighBits() + ", " + ts.getLowBits() + ")";                                              // 15
};                                                                                                                    // 16
                                                                                                                      // 17
idForOp = function (op) {                                                                                             // 18
  if (op.op === 'd')                                                                                                  // 19
    return op.o._id;                                                                                                  // 20
  else if (op.op === 'i')                                                                                             // 21
    return op.o._id;                                                                                                  // 22
  else if (op.op === 'u')                                                                                             // 23
    return op.o2._id;                                                                                                 // 24
  else if (op.op === 'c')                                                                                             // 25
    throw Error("Operator 'c' doesn't supply an object with id: " +                                                   // 26
                EJSON.stringify(op));                                                                                 // 27
  else                                                                                                                // 28
    throw Error("Unknown op: " + EJSON.stringify(op));                                                                // 29
};                                                                                                                    // 30
                                                                                                                      // 31
OplogHandle = function (oplogUrl, dbName) {                                                                           // 32
  var self = this;                                                                                                    // 33
  self._oplogUrl = oplogUrl;                                                                                          // 34
  self._dbName = dbName;                                                                                              // 35
                                                                                                                      // 36
  self._oplogLastEntryConnection = null;                                                                              // 37
  self._oplogTailConnection = null;                                                                                   // 38
  self._stopped = false;                                                                                              // 39
  self._tailHandle = null;                                                                                            // 40
  self._readyFuture = new Future();                                                                                   // 41
  self._crossbar = new DDPServer._Crossbar({                                                                          // 42
    factPackage: "mongo-livedata", factName: "oplog-watchers"                                                         // 43
  });                                                                                                                 // 44
  self._baseOplogSelector = {                                                                                         // 45
    ns: new RegExp('^' + quotemeta(self._dbName) + '\\.'),                                                            // 46
    $or: [                                                                                                            // 47
      { op: {$in: ['i', 'u', 'd']} },                                                                                 // 48
      // If it is not db.collection.drop(), ignore it                                                                 // 49
      { op: 'c', 'o.drop': { $exists: true } }]                                                                       // 50
  };                                                                                                                  // 51
                                                                                                                      // 52
  // Data structures to support waitUntilCaughtUp(). Each oplog entry has a                                           // 53
  // MongoTimestamp object on it (which is not the same as a Date --- it's a                                          // 54
  // combination of time and an incrementing counter; see                                                             // 55
  // http://docs.mongodb.org/manual/reference/bson-types/#timestamps).                                                // 56
  //                                                                                                                  // 57
  // _catchingUpFutures is an array of {ts: MongoTimestamp, future: Future}                                           // 58
  // objects, sorted by ascending timestamp. _lastProcessedTS is the                                                  // 59
  // MongoTimestamp of the last oplog entry we've processed.                                                          // 60
  //                                                                                                                  // 61
  // Each time we call waitUntilCaughtUp, we take a peek at the final oplog                                           // 62
  // entry in the db.  If we've already processed it (ie, it is not greater than                                      // 63
  // _lastProcessedTS), waitUntilCaughtUp immediately returns. Otherwise,                                             // 64
  // waitUntilCaughtUp makes a new Future and inserts it along with the final                                         // 65
  // timestamp entry that it read, into _catchingUpFutures. waitUntilCaughtUp                                         // 66
  // then waits on that future, which is resolved once _lastProcessedTS is                                            // 67
  // incremented to be past its timestamp by the worker fiber.                                                        // 68
  //                                                                                                                  // 69
  // XXX use a priority queue or something else that's faster than an array                                           // 70
  self._catchingUpFutures = [];                                                                                       // 71
  self._lastProcessedTS = null;                                                                                       // 72
                                                                                                                      // 73
  self._onSkippedEntriesHook = new Hook({                                                                             // 74
    debugPrintExceptions: "onSkippedEntries callback"                                                                 // 75
  });                                                                                                                 // 76
                                                                                                                      // 77
  self._entryQueue = new Meteor._DoubleEndedQueue();                                                                  // 78
  self._workerActive = false;                                                                                         // 79
                                                                                                                      // 80
  self._startTailing();                                                                                               // 81
};                                                                                                                    // 82
                                                                                                                      // 83
_.extend(OplogHandle.prototype, {                                                                                     // 84
  stop: function () {                                                                                                 // 85
    var self = this;                                                                                                  // 86
    if (self._stopped)                                                                                                // 87
      return;                                                                                                         // 88
    self._stopped = true;                                                                                             // 89
    if (self._tailHandle)                                                                                             // 90
      self._tailHandle.stop();                                                                                        // 91
    // XXX should close connections too                                                                               // 92
  },                                                                                                                  // 93
  onOplogEntry: function (trigger, callback) {                                                                        // 94
    var self = this;                                                                                                  // 95
    if (self._stopped)                                                                                                // 96
      throw new Error("Called onOplogEntry on stopped handle!");                                                      // 97
                                                                                                                      // 98
    // Calling onOplogEntry requires us to wait for the tailing to be ready.                                          // 99
    self._readyFuture.wait();                                                                                         // 100
                                                                                                                      // 101
    var originalCallback = callback;                                                                                  // 102
    callback = Meteor.bindEnvironment(function (notification) {                                                       // 103
      // XXX can we avoid this clone by making oplog.js careful?                                                      // 104
      originalCallback(EJSON.clone(notification));                                                                    // 105
    }, function (err) {                                                                                               // 106
      Meteor._debug("Error in oplog callback", err.stack);                                                            // 107
    });                                                                                                               // 108
    var listenHandle = self._crossbar.listen(trigger, callback);                                                      // 109
    return {                                                                                                          // 110
      stop: function () {                                                                                             // 111
        listenHandle.stop();                                                                                          // 112
      }                                                                                                               // 113
    };                                                                                                                // 114
  },                                                                                                                  // 115
  // Register a callback to be invoked any time we skip oplog entries (eg,                                            // 116
  // because we are too far behind).                                                                                  // 117
  onSkippedEntries: function (callback) {                                                                             // 118
    var self = this;                                                                                                  // 119
    if (self._stopped)                                                                                                // 120
      throw new Error("Called onSkippedEntries on stopped handle!");                                                  // 121
    return self._onSkippedEntriesHook.register(callback);                                                             // 122
  },                                                                                                                  // 123
  // Calls `callback` once the oplog has been processed up to a point that is                                         // 124
  // roughly "now": specifically, once we've processed all ops that are                                               // 125
  // currently visible.                                                                                               // 126
  // XXX become convinced that this is actually safe even if oplogConnection                                          // 127
  // is some kind of pool                                                                                             // 128
  waitUntilCaughtUp: function () {                                                                                    // 129
    var self = this;                                                                                                  // 130
    if (self._stopped)                                                                                                // 131
      throw new Error("Called waitUntilCaughtUp on stopped handle!");                                                 // 132
                                                                                                                      // 133
    // Calling waitUntilCaughtUp requries us to wait for the oplog connection to                                      // 134
    // be ready.                                                                                                      // 135
    self._readyFuture.wait();                                                                                         // 136
                                                                                                                      // 137
    while (!self._stopped) {                                                                                          // 138
      // We need to make the selector at least as restrictive as the actual                                           // 139
      // tailing selector (ie, we need to specify the DB name) or else we might                                       // 140
      // find a TS that won't show up in the actual tail stream.                                                      // 141
      try {                                                                                                           // 142
        var lastEntry = self._oplogLastEntryConnection.findOne(                                                       // 143
          OPLOG_COLLECTION, self._baseOplogSelector,                                                                  // 144
          {fields: {ts: 1}, sort: {$natural: -1}});                                                                   // 145
        break;                                                                                                        // 146
      } catch (e) {                                                                                                   // 147
        // During failover (eg) if we get an exception we should log and retry                                        // 148
        // instead of crashing.                                                                                       // 149
        Meteor._debug("Got exception while reading last entry: " + e);                                                // 150
        Meteor._sleepForMs(100);                                                                                      // 151
      }                                                                                                               // 152
    }                                                                                                                 // 153
                                                                                                                      // 154
    if (self._stopped)                                                                                                // 155
      return;                                                                                                         // 156
                                                                                                                      // 157
    if (!lastEntry) {                                                                                                 // 158
      // Really, nothing in the oplog? Well, we've processed everything.                                              // 159
      return;                                                                                                         // 160
    }                                                                                                                 // 161
                                                                                                                      // 162
    var ts = lastEntry.ts;                                                                                            // 163
    if (!ts)                                                                                                          // 164
      throw Error("oplog entry without ts: " + EJSON.stringify(lastEntry));                                           // 165
                                                                                                                      // 166
    if (self._lastProcessedTS && ts.lessThanOrEqual(self._lastProcessedTS)) {                                         // 167
      // We've already caught up to here.                                                                             // 168
      return;                                                                                                         // 169
    }                                                                                                                 // 170
                                                                                                                      // 171
                                                                                                                      // 172
    // Insert the future into our list. Almost always, this will be at the end,                                       // 173
    // but it's conceivable that if we fail over from one primary to another,                                         // 174
    // the oplog entries we see will go backwards.                                                                    // 175
    var insertAfter = self._catchingUpFutures.length;                                                                 // 176
    while (insertAfter - 1 > 0                                                                                        // 177
           && self._catchingUpFutures[insertAfter - 1].ts.greaterThan(ts)) {                                          // 178
      insertAfter--;                                                                                                  // 179
    }                                                                                                                 // 180
    var f = new Future;                                                                                               // 181
    self._catchingUpFutures.splice(insertAfter, 0, {ts: ts, future: f});                                              // 182
    f.wait();                                                                                                         // 183
  },                                                                                                                  // 184
  _startTailing: function () {                                                                                        // 185
    var self = this;                                                                                                  // 186
    // First, make sure that we're talking to the local database.                                                     // 187
    var mongodbUri = Npm.require('mongodb-uri');                                                                      // 188
    if (mongodbUri.parse(self._oplogUrl).database !== 'local') {                                                      // 189
      throw Error("$MONGO_OPLOG_URL must be set to the 'local' database of " +                                        // 190
                  "a Mongo replica set");                                                                             // 191
    }                                                                                                                 // 192
                                                                                                                      // 193
    // We make two separate connections to Mongo. The Node Mongo driver                                               // 194
    // implements a naive round-robin connection pool: each "connection" is a                                         // 195
    // pool of several (5 by default) TCP connections, and each request is                                            // 196
    // rotated through the pools. Tailable cursor queries block on the server                                         // 197
    // until there is some data to return (or until a few seconds have                                                // 198
    // passed). So if the connection pool used for tailing cursors is the same                                        // 199
    // pool used for other queries, the other queries will be delayed by seconds                                      // 200
    // 1/5 of the time.                                                                                               // 201
    //                                                                                                                // 202
    // The tail connection will only ever be running a single tail command, so                                        // 203
    // it only needs to make one underlying TCP connection.                                                           // 204
    self._oplogTailConnection = new MongoConnection(                                                                  // 205
      self._oplogUrl, {poolSize: 1});                                                                                 // 206
    // XXX better docs, but: it's to get monotonic results                                                            // 207
    // XXX is it safe to say "if there's an in flight query, just use its                                             // 208
    //     results"? I don't think so but should consider that                                                        // 209
    self._oplogLastEntryConnection = new MongoConnection(                                                             // 210
      self._oplogUrl, {poolSize: 1});                                                                                 // 211
                                                                                                                      // 212
    // Now, make sure that there actually is a repl set here. If not, oplog                                           // 213
    // tailing won't ever find anything!                                                                              // 214
    var f = new Future;                                                                                               // 215
    self._oplogLastEntryConnection.db.admin().command(                                                                // 216
      { ismaster: 1 }, f.resolver());                                                                                 // 217
    var isMasterDoc = f.wait();                                                                                       // 218
    if (!(isMasterDoc && isMasterDoc.documents && isMasterDoc.documents[0] &&                                         // 219
          isMasterDoc.documents[0].setName)) {                                                                        // 220
      throw Error("$MONGO_OPLOG_URL must be set to the 'local' database of " +                                        // 221
                  "a Mongo replica set");                                                                             // 222
    }                                                                                                                 // 223
                                                                                                                      // 224
    // Find the last oplog entry.                                                                                     // 225
    var lastOplogEntry = self._oplogLastEntryConnection.findOne(                                                      // 226
      OPLOG_COLLECTION, {}, {sort: {$natural: -1}, fields: {ts: 1}});                                                 // 227
                                                                                                                      // 228
    var oplogSelector = _.clone(self._baseOplogSelector);                                                             // 229
    if (lastOplogEntry) {                                                                                             // 230
      // Start after the last entry that currently exists.                                                            // 231
      oplogSelector.ts = {$gt: lastOplogEntry.ts};                                                                    // 232
      // If there are any calls to callWhenProcessedLatest before any other                                           // 233
      // oplog entries show up, allow callWhenProcessedLatest to call its                                             // 234
      // callback immediately.                                                                                        // 235
      self._lastProcessedTS = lastOplogEntry.ts;                                                                      // 236
    }                                                                                                                 // 237
                                                                                                                      // 238
    var cursorDescription = new CursorDescription(                                                                    // 239
      OPLOG_COLLECTION, oplogSelector, {tailable: true});                                                             // 240
                                                                                                                      // 241
    self._tailHandle = self._oplogTailConnection.tail(                                                                // 242
      cursorDescription, function (doc) {                                                                             // 243
        self._entryQueue.push(doc);                                                                                   // 244
        self._maybeStartWorker();                                                                                     // 245
      }                                                                                                               // 246
    );                                                                                                                // 247
    self._readyFuture.return();                                                                                       // 248
  },                                                                                                                  // 249
                                                                                                                      // 250
  _maybeStartWorker: function () {                                                                                    // 251
    var self = this;                                                                                                  // 252
    if (self._workerActive)                                                                                           // 253
      return;                                                                                                         // 254
    self._workerActive = true;                                                                                        // 255
    Meteor.defer(function () {                                                                                        // 256
      try {                                                                                                           // 257
        while (! self._stopped && ! self._entryQueue.isEmpty()) {                                                     // 258
          // Are we too far behind? Just tell our observers that they need to                                         // 259
          // repoll, and drop our queue.                                                                              // 260
          if (self._entryQueue.length > TOO_FAR_BEHIND) {                                                             // 261
            var lastEntry = self._entryQueue.pop();                                                                   // 262
            self._entryQueue.clear();                                                                                 // 263
                                                                                                                      // 264
            self._onSkippedEntriesHook.each(function (callback) {                                                     // 265
              callback();                                                                                             // 266
              return true;                                                                                            // 267
            });                                                                                                       // 268
                                                                                                                      // 269
            // Free any waitUntilCaughtUp() calls that were waiting for us to                                         // 270
            // pass something that we just skipped.                                                                   // 271
            self._setLastProcessedTS(lastEntry.ts);                                                                   // 272
            continue;                                                                                                 // 273
          }                                                                                                           // 274
                                                                                                                      // 275
          var doc = self._entryQueue.shift();                                                                         // 276
                                                                                                                      // 277
          if (!(doc.ns && doc.ns.length > self._dbName.length + 1 &&                                                  // 278
                doc.ns.substr(0, self._dbName.length + 1) ===                                                         // 279
                (self._dbName + '.'))) {                                                                              // 280
            throw new Error("Unexpected ns");                                                                         // 281
          }                                                                                                           // 282
                                                                                                                      // 283
          var trigger = {collection: doc.ns.substr(self._dbName.length + 1),                                          // 284
                         dropCollection: false,                                                                       // 285
                         op: doc};                                                                                    // 286
                                                                                                                      // 287
          // Is it a special command and the collection name is hidden somewhere                                      // 288
          // in operator?                                                                                             // 289
          if (trigger.collection === "$cmd") {                                                                        // 290
            trigger.collection = doc.o.drop;                                                                          // 291
            trigger.dropCollection = true;                                                                            // 292
            trigger.id = null;                                                                                        // 293
          } else {                                                                                                    // 294
            // All other ops have an id.                                                                              // 295
            trigger.id = idForOp(doc);                                                                                // 296
          }                                                                                                           // 297
                                                                                                                      // 298
          self._crossbar.fire(trigger);                                                                               // 299
                                                                                                                      // 300
          // Now that we've processed this operation, process pending                                                 // 301
          // sequencers.                                                                                              // 302
          if (!doc.ts)                                                                                                // 303
            throw Error("oplog entry without ts: " + EJSON.stringify(doc));                                           // 304
          self._setLastProcessedTS(doc.ts);                                                                           // 305
        }                                                                                                             // 306
      } finally {                                                                                                     // 307
        self._workerActive = false;                                                                                   // 308
      }                                                                                                               // 309
    });                                                                                                               // 310
  },                                                                                                                  // 311
  _setLastProcessedTS: function (ts) {                                                                                // 312
    var self = this;                                                                                                  // 313
    self._lastProcessedTS = ts;                                                                                       // 314
    while (!_.isEmpty(self._catchingUpFutures)                                                                        // 315
           && self._catchingUpFutures[0].ts.lessThanOrEqual(                                                          // 316
             self._lastProcessedTS)) {                                                                                // 317
      var sequencer = self._catchingUpFutures.shift();                                                                // 318
      sequencer.future.return();                                                                                      // 319
    }                                                                                                                 // 320
  }                                                                                                                   // 321
});                                                                                                                   // 322
                                                                                                                      // 323
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/mongo/observe_multiplex.js                                                                                //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
var Future = Npm.require('fibers/future');                                                                            // 1
                                                                                                                      // 2
ObserveMultiplexer = function (options) {                                                                             // 3
  var self = this;                                                                                                    // 4
                                                                                                                      // 5
  if (!options || !_.has(options, 'ordered'))                                                                         // 6
    throw Error("must specified ordered");                                                                            // 7
                                                                                                                      // 8
  Package.facts && Package.facts.Facts.incrementServerFact(                                                           // 9
    "mongo-livedata", "observe-multiplexers", 1);                                                                     // 10
                                                                                                                      // 11
  self._ordered = options.ordered;                                                                                    // 12
  self._onStop = options.onStop || function () {};                                                                    // 13
  self._queue = new Meteor._SynchronousQueue();                                                                       // 14
  self._handles = {};                                                                                                 // 15
  self._readyFuture = new Future;                                                                                     // 16
  self._cache = new LocalCollection._CachingChangeObserver({                                                          // 17
    ordered: options.ordered});                                                                                       // 18
  // Number of addHandleAndSendInitialAdds tasks scheduled but not yet                                                // 19
  // running. removeHandle uses this to know if it's time to call the onStop                                          // 20
  // callback.                                                                                                        // 21
  self._addHandleTasksScheduledButNotPerformed = 0;                                                                   // 22
                                                                                                                      // 23
  _.each(self.callbackNames(), function (callbackName) {                                                              // 24
    self[callbackName] = function (/* ... */) {                                                                       // 25
      self._applyCallback(callbackName, _.toArray(arguments));                                                        // 26
    };                                                                                                                // 27
  });                                                                                                                 // 28
};                                                                                                                    // 29
                                                                                                                      // 30
_.extend(ObserveMultiplexer.prototype, {                                                                              // 31
  addHandleAndSendInitialAdds: function (handle) {                                                                    // 32
    var self = this;                                                                                                  // 33
                                                                                                                      // 34
    // Check this before calling runTask (even though runTask does the same                                           // 35
    // check) so that we don't leak an ObserveMultiplexer on error by                                                 // 36
    // incrementing _addHandleTasksScheduledButNotPerformed and never                                                 // 37
    // decrementing it.                                                                                               // 38
    if (!self._queue.safeToRunTask())                                                                                 // 39
      throw new Error(                                                                                                // 40
        "Can't call observeChanges from an observe callback on the same query");                                      // 41
    ++self._addHandleTasksScheduledButNotPerformed;                                                                   // 42
                                                                                                                      // 43
    Package.facts && Package.facts.Facts.incrementServerFact(                                                         // 44
      "mongo-livedata", "observe-handles", 1);                                                                        // 45
                                                                                                                      // 46
    self._queue.runTask(function () {                                                                                 // 47
      self._handles[handle._id] = handle;                                                                             // 48
      // Send out whatever adds we have so far (whether or not we the                                                 // 49
      // multiplexer is ready).                                                                                       // 50
      self._sendAdds(handle);                                                                                         // 51
      --self._addHandleTasksScheduledButNotPerformed;                                                                 // 52
    });                                                                                                               // 53
    // *outside* the task, since otherwise we'd deadlock                                                              // 54
    self._readyFuture.wait();                                                                                         // 55
  },                                                                                                                  // 56
                                                                                                                      // 57
  // Remove an observe handle. If it was the last observe handle, call the                                            // 58
  // onStop callback; you cannot add any more observe handles after this.                                             // 59
  //                                                                                                                  // 60
  // This is not synchronized with polls and handle additions: this means that                                        // 61
  // you can safely call it from within an observe callback, but it also means                                        // 62
  // that we have to be careful when we iterate over _handles.                                                        // 63
  removeHandle: function (id) {                                                                                       // 64
    var self = this;                                                                                                  // 65
                                                                                                                      // 66
    // This should not be possible: you can only call removeHandle by having                                          // 67
    // access to the ObserveHandle, which isn't returned to user code until the                                       // 68
    // multiplex is ready.                                                                                            // 69
    if (!self._ready())                                                                                               // 70
      throw new Error("Can't remove handles until the multiplex is ready");                                           // 71
                                                                                                                      // 72
    delete self._handles[id];                                                                                         // 73
                                                                                                                      // 74
    Package.facts && Package.facts.Facts.incrementServerFact(                                                         // 75
      "mongo-livedata", "observe-handles", -1);                                                                       // 76
                                                                                                                      // 77
    if (_.isEmpty(self._handles) &&                                                                                   // 78
        self._addHandleTasksScheduledButNotPerformed === 0) {                                                         // 79
      self._stop();                                                                                                   // 80
    }                                                                                                                 // 81
  },                                                                                                                  // 82
  _stop: function (options) {                                                                                         // 83
    var self = this;                                                                                                  // 84
    options = options || {};                                                                                          // 85
                                                                                                                      // 86
    // It shouldn't be possible for us to stop when all our handles still                                             // 87
    // haven't been returned from observeChanges!                                                                     // 88
    if (! self._ready() && ! options.fromQueryError)                                                                  // 89
      throw Error("surprising _stop: not ready");                                                                     // 90
                                                                                                                      // 91
    // Call stop callback (which kills the underlying process which sends us                                          // 92
    // callbacks and removes us from the connection's dictionary).                                                    // 93
    self._onStop();                                                                                                   // 94
    Package.facts && Package.facts.Facts.incrementServerFact(                                                         // 95
      "mongo-livedata", "observe-multiplexers", -1);                                                                  // 96
                                                                                                                      // 97
    // Cause future addHandleAndSendInitialAdds calls to throw (but the onStop                                        // 98
    // callback should make our connection forget about us).                                                          // 99
    self._handles = null;                                                                                             // 100
  },                                                                                                                  // 101
                                                                                                                      // 102
  // Allows all addHandleAndSendInitialAdds calls to return, once all preceding                                       // 103
  // adds have been processed. Does not block.                                                                        // 104
  ready: function () {                                                                                                // 105
    var self = this;                                                                                                  // 106
    self._queue.queueTask(function () {                                                                               // 107
      if (self._ready())                                                                                              // 108
        throw Error("can't make ObserveMultiplex ready twice!");                                                      // 109
      self._readyFuture.return();                                                                                     // 110
    });                                                                                                               // 111
  },                                                                                                                  // 112
                                                                                                                      // 113
  // If trying to execute the query results in an error, call this. This is                                           // 114
  // intended for permanent errors, not transient network errors that could be                                        // 115
  // fixed. It should only be called before ready(), because if you called ready                                      // 116
  // that meant that you managed to run the query once. It will stop this                                             // 117
  // ObserveMultiplex and cause addHandleAndSendInitialAdds calls (and thus                                           // 118
  // observeChanges calls) to throw the error.                                                                        // 119
  queryError: function (err) {                                                                                        // 120
    var self = this;                                                                                                  // 121
    self._queue.runTask(function () {                                                                                 // 122
      if (self._ready())                                                                                              // 123
        throw Error("can't claim query has an error after it worked!");                                               // 124
      self._stop({fromQueryError: true});                                                                             // 125
      self._readyFuture.throw(err);                                                                                   // 126
    });                                                                                                               // 127
  },                                                                                                                  // 128
                                                                                                                      // 129
  // Calls "cb" once the effects of all "ready", "addHandleAndSendInitialAdds"                                        // 130
  // and observe callbacks which came before this call have been propagated to                                        // 131
  // all handles. "ready" must have already been called on this multiplexer.                                          // 132
  onFlush: function (cb) {                                                                                            // 133
    var self = this;                                                                                                  // 134
    self._queue.queueTask(function () {                                                                               // 135
      if (!self._ready())                                                                                             // 136
        throw Error("only call onFlush on a multiplexer that will be ready");                                         // 137
      cb();                                                                                                           // 138
    });                                                                                                               // 139
  },                                                                                                                  // 140
  callbackNames: function () {                                                                                        // 141
    var self = this;                                                                                                  // 142
    if (self._ordered)                                                                                                // 143
      return ["addedBefore", "changed", "movedBefore", "removed"];                                                    // 144
    else                                                                                                              // 145
      return ["added", "changed", "removed"];                                                                         // 146
  },                                                                                                                  // 147
  _ready: function () {                                                                                               // 148
    return this._readyFuture.isResolved();                                                                            // 149
  },                                                                                                                  // 150
  _applyCallback: function (callbackName, args) {                                                                     // 151
    var self = this;                                                                                                  // 152
    self._queue.queueTask(function () {                                                                               // 153
      // If we stopped in the meantime, do nothing.                                                                   // 154
      if (!self._handles)                                                                                             // 155
        return;                                                                                                       // 156
                                                                                                                      // 157
      // First, apply the change to the cache.                                                                        // 158
      // XXX We could make applyChange callbacks promise not to hang on to any                                        // 159
      // state from their arguments (assuming that their supplied callbacks                                           // 160
      // don't) and skip this clone. Currently 'changed' hangs on to state                                            // 161
      // though.                                                                                                      // 162
      self._cache.applyChange[callbackName].apply(null, EJSON.clone(args));                                           // 163
                                                                                                                      // 164
      // If we haven't finished the initial adds, then we should only be getting                                      // 165
      // adds.                                                                                                        // 166
      if (!self._ready() &&                                                                                           // 167
          (callbackName !== 'added' && callbackName !== 'addedBefore')) {                                             // 168
        throw new Error("Got " + callbackName + " during initial adds");                                              // 169
      }                                                                                                               // 170
                                                                                                                      // 171
      // Now multiplex the callbacks out to all observe handles. It's OK if                                           // 172
      // these calls yield; since we're inside a task, no other use of our queue                                      // 173
      // can continue until these are done. (But we do have to be careful to not                                      // 174
      // use a handle that got removed, because removeHandle does not use the                                         // 175
      // queue; thus, we iterate over an array of keys that we control.)                                              // 176
      _.each(_.keys(self._handles), function (handleId) {                                                             // 177
        var handle = self._handles && self._handles[handleId];                                                        // 178
        if (!handle)                                                                                                  // 179
          return;                                                                                                     // 180
        var callback = handle['_' + callbackName];                                                                    // 181
        // clone arguments so that callbacks can mutate their arguments                                               // 182
        callback && callback.apply(null, EJSON.clone(args));                                                          // 183
      });                                                                                                             // 184
    });                                                                                                               // 185
  },                                                                                                                  // 186
                                                                                                                      // 187
  // Sends initial adds to a handle. It should only be called from within a task                                      // 188
  // (the task that is processing the addHandleAndSendInitialAdds call). It                                           // 189
  // synchronously invokes the handle's added or addedBefore; there's no need to                                      // 190
  // flush the queue afterwards to ensure that the callbacks get out.                                                 // 191
  _sendAdds: function (handle) {                                                                                      // 192
    var self = this;                                                                                                  // 193
    if (self._queue.safeToRunTask())                                                                                  // 194
      throw Error("_sendAdds may only be called from within a task!");                                                // 195
    var add = self._ordered ? handle._addedBefore : handle._added;                                                    // 196
    if (!add)                                                                                                         // 197
      return;                                                                                                         // 198
    // note: docs may be an _IdMap or an OrderedDict                                                                  // 199
    self._cache.docs.forEach(function (doc, id) {                                                                     // 200
      if (!_.has(self._handles, handle._id))                                                                          // 201
        throw Error("handle got removed before sending initial adds!");                                               // 202
      var fields = EJSON.clone(doc);                                                                                  // 203
      delete fields._id;                                                                                              // 204
      if (self._ordered)                                                                                              // 205
        add(id, fields, null); // we're going in order, so add at end                                                 // 206
      else                                                                                                            // 207
        add(id, fields);                                                                                              // 208
    });                                                                                                               // 209
  }                                                                                                                   // 210
});                                                                                                                   // 211
                                                                                                                      // 212
                                                                                                                      // 213
var nextObserveHandleId = 1;                                                                                          // 214
ObserveHandle = function (multiplexer, callbacks) {                                                                   // 215
  var self = this;                                                                                                    // 216
  // The end user is only supposed to call stop().  The other fields are                                              // 217
  // accessible to the multiplexer, though.                                                                           // 218
  self._multiplexer = multiplexer;                                                                                    // 219
  _.each(multiplexer.callbackNames(), function (name) {                                                               // 220
    if (callbacks[name]) {                                                                                            // 221
      self['_' + name] = callbacks[name];                                                                             // 222
    } else if (name === "addedBefore" && callbacks.added) {                                                           // 223
      // Special case: if you specify "added" and "movedBefore", you get an                                           // 224
      // ordered observe where for some reason you don't get ordering data on                                         // 225
      // the adds.  I dunno, we wrote tests for it, there must have been a                                            // 226
      // reason.                                                                                                      // 227
      self._addedBefore = function (id, fields, before) {                                                             // 228
        callbacks.added(id, fields);                                                                                  // 229
      };                                                                                                              // 230
    }                                                                                                                 // 231
  });                                                                                                                 // 232
  self._stopped = false;                                                                                              // 233
  self._id = nextObserveHandleId++;                                                                                   // 234
};                                                                                                                    // 235
ObserveHandle.prototype.stop = function () {                                                                          // 236
  var self = this;                                                                                                    // 237
  if (self._stopped)                                                                                                  // 238
    return;                                                                                                           // 239
  self._stopped = true;                                                                                               // 240
  self._multiplexer.removeHandle(self._id);                                                                           // 241
};                                                                                                                    // 242
                                                                                                                      // 243
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/mongo/doc_fetcher.js                                                                                      //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
var Fiber = Npm.require('fibers');                                                                                    // 1
var Future = Npm.require('fibers/future');                                                                            // 2
                                                                                                                      // 3
DocFetcher = function (mongoConnection) {                                                                             // 4
  var self = this;                                                                                                    // 5
  self._mongoConnection = mongoConnection;                                                                            // 6
  // Map from cache key -> [callback]                                                                                 // 7
  self._callbacksForCacheKey = {};                                                                                    // 8
};                                                                                                                    // 9
                                                                                                                      // 10
_.extend(DocFetcher.prototype, {                                                                                      // 11
  // Fetches document "id" from collectionName, returning it or null if not                                           // 12
  // found.                                                                                                           // 13
  //                                                                                                                  // 14
  // If you make multiple calls to fetch() with the same cacheKey (a string),                                         // 15
  // DocFetcher may assume that they all return the same document. (It does                                           // 16
  // not check to see if collectionName/id match.)                                                                    // 17
  //                                                                                                                  // 18
  // You may assume that callback is never called synchronously (and in fact                                          // 19
  // OplogObserveDriver does so).                                                                                     // 20
  fetch: function (collectionName, id, cacheKey, callback) {                                                          // 21
    var self = this;                                                                                                  // 22
                                                                                                                      // 23
    check(collectionName, String);                                                                                    // 24
    // id is some sort of scalar                                                                                      // 25
    check(cacheKey, String);                                                                                          // 26
                                                                                                                      // 27
    // If there's already an in-progress fetch for this cache key, yield until                                        // 28
    // it's done and return whatever it returns.                                                                      // 29
    if (_.has(self._callbacksForCacheKey, cacheKey)) {                                                                // 30
      self._callbacksForCacheKey[cacheKey].push(callback);                                                            // 31
      return;                                                                                                         // 32
    }                                                                                                                 // 33
                                                                                                                      // 34
    var callbacks = self._callbacksForCacheKey[cacheKey] = [callback];                                                // 35
                                                                                                                      // 36
    Fiber(function () {                                                                                               // 37
      try {                                                                                                           // 38
        var doc = self._mongoConnection.findOne(                                                                      // 39
          collectionName, {_id: id}) || null;                                                                         // 40
        // Return doc to all relevant callbacks. Note that this array can                                             // 41
        // continue to grow during callback excecution.                                                               // 42
        while (!_.isEmpty(callbacks)) {                                                                               // 43
          // Clone the document so that the various calls to fetch don't return                                       // 44
          // objects that are intertwingled with each other. Clone before                                             // 45
          // popping the future, so that if clone throws, the error gets passed                                       // 46
          // to the next callback.                                                                                    // 47
          var clonedDoc = EJSON.clone(doc);                                                                           // 48
          callbacks.pop()(null, clonedDoc);                                                                           // 49
        }                                                                                                             // 50
      } catch (e) {                                                                                                   // 51
        while (!_.isEmpty(callbacks)) {                                                                               // 52
          callbacks.pop()(e);                                                                                         // 53
        }                                                                                                             // 54
      } finally {                                                                                                     // 55
        // XXX consider keeping the doc around for a period of time before                                            // 56
        // removing from the cache                                                                                    // 57
        delete self._callbacksForCacheKey[cacheKey];                                                                  // 58
      }                                                                                                               // 59
    }).run();                                                                                                         // 60
  }                                                                                                                   // 61
});                                                                                                                   // 62
                                                                                                                      // 63
MongoTest.DocFetcher = DocFetcher;                                                                                    // 64
                                                                                                                      // 65
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/mongo/polling_observe_driver.js                                                                           //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
PollingObserveDriver = function (options) {                                                                           // 1
  var self = this;                                                                                                    // 2
                                                                                                                      // 3
  self._cursorDescription = options.cursorDescription;                                                                // 4
  self._mongoHandle = options.mongoHandle;                                                                            // 5
  self._ordered = options.ordered;                                                                                    // 6
  self._multiplexer = options.multiplexer;                                                                            // 7
  self._stopCallbacks = [];                                                                                           // 8
  self._stopped = false;                                                                                              // 9
                                                                                                                      // 10
  self._synchronousCursor = self._mongoHandle._createSynchronousCursor(                                               // 11
    self._cursorDescription);                                                                                         // 12
                                                                                                                      // 13
  // previous results snapshot.  on each poll cycle, diffs against                                                    // 14
  // results drives the callbacks.                                                                                    // 15
  self._results = null;                                                                                               // 16
                                                                                                                      // 17
  // The number of _pollMongo calls that have been added to self._taskQueue but                                       // 18
  // have not started running. Used to make sure we never schedule more than one                                      // 19
  // _pollMongo (other than possibly the one that is currently running). It's                                         // 20
  // also used by _suspendPolling to pretend there's a poll scheduled. Usually,                                       // 21
  // it's either 0 (for "no polls scheduled other than maybe one currently                                            // 22
  // running") or 1 (for "a poll scheduled that isn't running yet"), but it can                                       // 23
  // also be 2 if incremented by _suspendPolling.                                                                     // 24
  self._pollsScheduledButNotStarted = 0;                                                                              // 25
  self._pendingWrites = []; // people to notify when polling completes                                                // 26
                                                                                                                      // 27
  // Make sure to create a separately throttled function for each                                                     // 28
  // PollingObserveDriver object.                                                                                     // 29
  self._ensurePollIsScheduled = _.throttle(                                                                           // 30
    self._unthrottledEnsurePollIsScheduled, 50 /* ms */);                                                             // 31
                                                                                                                      // 32
  // XXX figure out if we still need a queue                                                                          // 33
  self._taskQueue = new Meteor._SynchronousQueue();                                                                   // 34
                                                                                                                      // 35
  var listenersHandle = listenAll(                                                                                    // 36
    self._cursorDescription, function (notification) {                                                                // 37
      // When someone does a transaction that might affect us, schedule a poll                                        // 38
      // of the database. If that transaction happens inside of a write fence,                                        // 39
      // block the fence until we've polled and notified observers.                                                   // 40
      var fence = DDPServer._CurrentWriteFence.get();                                                                 // 41
      if (fence)                                                                                                      // 42
        self._pendingWrites.push(fence.beginWrite());                                                                 // 43
      // Ensure a poll is scheduled... but if we already know that one is,                                            // 44
      // don't hit the throttled _ensurePollIsScheduled function (which might                                         // 45
      // lead to us calling it unnecessarily in 50ms).                                                                // 46
      if (self._pollsScheduledButNotStarted === 0)                                                                    // 47
        self._ensurePollIsScheduled();                                                                                // 48
    }                                                                                                                 // 49
  );                                                                                                                  // 50
  self._stopCallbacks.push(function () { listenersHandle.stop(); });                                                  // 51
                                                                                                                      // 52
  // every once and a while, poll even if we don't think we're dirty, for                                             // 53
  // eventual consistency with database writes from outside the Meteor                                                // 54
  // universe.                                                                                                        // 55
  //                                                                                                                  // 56
  // For testing, there's an undocumented callback argument to observeChanges                                         // 57
  // which disables time-based polling and gets called at the beginning of each                                       // 58
  // poll.                                                                                                            // 59
  if (options._testOnlyPollCallback) {                                                                                // 60
    self._testOnlyPollCallback = options._testOnlyPollCallback;                                                       // 61
  } else {                                                                                                            // 62
    var intervalHandle = Meteor.setInterval(                                                                          // 63
      _.bind(self._ensurePollIsScheduled, self), 10 * 1000);                                                          // 64
    self._stopCallbacks.push(function () {                                                                            // 65
      Meteor.clearInterval(intervalHandle);                                                                           // 66
    });                                                                                                               // 67
  }                                                                                                                   // 68
                                                                                                                      // 69
  // Make sure we actually poll soon!                                                                                 // 70
  self._unthrottledEnsurePollIsScheduled();                                                                           // 71
                                                                                                                      // 72
  Package.facts && Package.facts.Facts.incrementServerFact(                                                           // 73
    "mongo-livedata", "observe-drivers-polling", 1);                                                                  // 74
};                                                                                                                    // 75
                                                                                                                      // 76
_.extend(PollingObserveDriver.prototype, {                                                                            // 77
  // This is always called through _.throttle (except once at startup).                                               // 78
  _unthrottledEnsurePollIsScheduled: function () {                                                                    // 79
    var self = this;                                                                                                  // 80
    if (self._pollsScheduledButNotStarted > 0)                                                                        // 81
      return;                                                                                                         // 82
    ++self._pollsScheduledButNotStarted;                                                                              // 83
    self._taskQueue.queueTask(function () {                                                                           // 84
      self._pollMongo();                                                                                              // 85
    });                                                                                                               // 86
  },                                                                                                                  // 87
                                                                                                                      // 88
  // test-only interface for controlling polling.                                                                     // 89
  //                                                                                                                  // 90
  // _suspendPolling blocks until any currently running and scheduled polls are                                       // 91
  // done, and prevents any further polls from being scheduled. (new                                                  // 92
  // ObserveHandles can be added and receive their initial added callbacks,                                           // 93
  // though.)                                                                                                         // 94
  //                                                                                                                  // 95
  // _resumePolling immediately polls, and allows further polls to occur.                                             // 96
  _suspendPolling: function() {                                                                                       // 97
    var self = this;                                                                                                  // 98
    // Pretend that there's another poll scheduled (which will prevent                                                // 99
    // _ensurePollIsScheduled from queueing any more polls).                                                          // 100
    ++self._pollsScheduledButNotStarted;                                                                              // 101
    // Now block until all currently running or scheduled polls are done.                                             // 102
    self._taskQueue.runTask(function() {});                                                                           // 103
                                                                                                                      // 104
    // Confirm that there is only one "poll" (the fake one we're pretending to                                        // 105
    // have) scheduled.                                                                                               // 106
    if (self._pollsScheduledButNotStarted !== 1)                                                                      // 107
      throw new Error("_pollsScheduledButNotStarted is " +                                                            // 108
                      self._pollsScheduledButNotStarted);                                                             // 109
  },                                                                                                                  // 110
  _resumePolling: function() {                                                                                        // 111
    var self = this;                                                                                                  // 112
    // We should be in the same state as in the end of _suspendPolling.                                               // 113
    if (self._pollsScheduledButNotStarted !== 1)                                                                      // 114
      throw new Error("_pollsScheduledButNotStarted is " +                                                            // 115
                      self._pollsScheduledButNotStarted);                                                             // 116
    // Run a poll synchronously (which will counteract the                                                            // 117
    // ++_pollsScheduledButNotStarted from _suspendPolling).                                                          // 118
    self._taskQueue.runTask(function () {                                                                             // 119
      self._pollMongo();                                                                                              // 120
    });                                                                                                               // 121
  },                                                                                                                  // 122
                                                                                                                      // 123
  _pollMongo: function () {                                                                                           // 124
    var self = this;                                                                                                  // 125
    --self._pollsScheduledButNotStarted;                                                                              // 126
                                                                                                                      // 127
    if (self._stopped)                                                                                                // 128
      return;                                                                                                         // 129
                                                                                                                      // 130
    var first = false;                                                                                                // 131
    var oldResults = self._results;                                                                                   // 132
    if (!oldResults) {                                                                                                // 133
      first = true;                                                                                                   // 134
      // XXX maybe use OrderedDict instead?                                                                           // 135
      oldResults = self._ordered ? [] : new LocalCollection._IdMap;                                                   // 136
    }                                                                                                                 // 137
                                                                                                                      // 138
    self._testOnlyPollCallback && self._testOnlyPollCallback();                                                       // 139
                                                                                                                      // 140
    // Save the list of pending writes which this round will commit.                                                  // 141
    var writesForCycle = self._pendingWrites;                                                                         // 142
    self._pendingWrites = [];                                                                                         // 143
                                                                                                                      // 144
    // Get the new query results. (This yields.)                                                                      // 145
    try {                                                                                                             // 146
      var newResults = self._synchronousCursor.getRawObjects(self._ordered);                                          // 147
    } catch (e) {                                                                                                     // 148
      if (first && typeof(e.code) === 'number') {                                                                     // 149
        // This is an error document sent to us by mongod, not a connection                                           // 150
        // error generated by the client. And we've never seen this query work                                        // 151
        // successfully. Probably it's a bad selector or something, so we should                                      // 152
        // NOT retry. Instead, we should halt the observe (which ends up calling                                      // 153
        // `stop` on us).                                                                                             // 154
        self._multiplexer.queryError(                                                                                 // 155
          new Error(                                                                                                  // 156
            "Exception while polling query " +                                                                        // 157
              JSON.stringify(self._cursorDescription) + ": " + e.message));                                           // 158
        return;                                                                                                       // 159
      }                                                                                                               // 160
                                                                                                                      // 161
      // getRawObjects can throw if we're having trouble talking to the                                               // 162
      // database.  That's fine --- we will repoll later anyway. But we should                                        // 163
      // make sure not to lose track of this cycle's writes.                                                          // 164
      // (It also can throw if there's just something invalid about this query;                                       // 165
      // unfortunately the ObserveDriver API doesn't provide a good way to                                            // 166
      // "cancel" the observe from the inside in this case.                                                           // 167
      Array.prototype.push.apply(self._pendingWrites, writesForCycle);                                                // 168
      Meteor._debug("Exception while polling query " +                                                                // 169
                    JSON.stringify(self._cursorDescription) + ": " + e.stack);                                        // 170
      return;                                                                                                         // 171
    }                                                                                                                 // 172
                                                                                                                      // 173
    // Run diffs.                                                                                                     // 174
    if (!self._stopped) {                                                                                             // 175
      LocalCollection._diffQueryChanges(                                                                              // 176
        self._ordered, oldResults, newResults, self._multiplexer);                                                    // 177
    }                                                                                                                 // 178
                                                                                                                      // 179
    // Signals the multiplexer to allow all observeChanges calls that share this                                      // 180
    // multiplexer to return. (This happens asynchronously, via the                                                   // 181
    // multiplexer's queue.)                                                                                          // 182
    if (first)                                                                                                        // 183
      self._multiplexer.ready();                                                                                      // 184
                                                                                                                      // 185
    // Replace self._results atomically.  (This assignment is what makes `first`                                      // 186
    // stay through on the next cycle, so we've waited until after we've                                              // 187
    // committed to ready-ing the multiplexer.)                                                                       // 188
    self._results = newResults;                                                                                       // 189
                                                                                                                      // 190
    // Once the ObserveMultiplexer has processed everything we've done in this                                        // 191
    // round, mark all the writes which existed before this call as                                                   // 192
    // commmitted. (If new writes have shown up in the meantime, there'll                                             // 193
    // already be another _pollMongo task scheduled.)                                                                 // 194
    self._multiplexer.onFlush(function () {                                                                           // 195
      _.each(writesForCycle, function (w) {                                                                           // 196
        w.committed();                                                                                                // 197
      });                                                                                                             // 198
    });                                                                                                               // 199
  },                                                                                                                  // 200
                                                                                                                      // 201
  stop: function () {                                                                                                 // 202
    var self = this;                                                                                                  // 203
    self._stopped = true;                                                                                             // 204
    _.each(self._stopCallbacks, function (c) { c(); });                                                               // 205
    // Release any write fences that are waiting on us.                                                               // 206
    _.each(self._pendingWrites, function (w) {                                                                        // 207
      w.committed();                                                                                                  // 208
    });                                                                                                               // 209
    Package.facts && Package.facts.Facts.incrementServerFact(                                                         // 210
      "mongo-livedata", "observe-drivers-polling", -1);                                                               // 211
  }                                                                                                                   // 212
});                                                                                                                   // 213
                                                                                                                      // 214
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/mongo/oplog_observe_driver.js                                                                             //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
var Fiber = Npm.require('fibers');                                                                                    // 1
var Future = Npm.require('fibers/future');                                                                            // 2
                                                                                                                      // 3
var PHASE = {                                                                                                         // 4
  QUERYING: "QUERYING",                                                                                               // 5
  FETCHING: "FETCHING",                                                                                               // 6
  STEADY: "STEADY"                                                                                                    // 7
};                                                                                                                    // 8
                                                                                                                      // 9
// Exception thrown by _needToPollQuery which unrolls the stack up to the                                             // 10
// enclosing call to finishIfNeedToPollQuery.                                                                         // 11
var SwitchedToQuery = function () {};                                                                                 // 12
var finishIfNeedToPollQuery = function (f) {                                                                          // 13
  return function () {                                                                                                // 14
    try {                                                                                                             // 15
      f.apply(this, arguments);                                                                                       // 16
    } catch (e) {                                                                                                     // 17
      if (!(e instanceof SwitchedToQuery))                                                                            // 18
        throw e;                                                                                                      // 19
    }                                                                                                                 // 20
  };                                                                                                                  // 21
};                                                                                                                    // 22
                                                                                                                      // 23
// OplogObserveDriver is an alternative to PollingObserveDriver which follows                                         // 24
// the Mongo operation log instead of just re-polling the query. It obeys the                                         // 25
// same simple interface: constructing it starts sending observeChanges                                               // 26
// callbacks (and a ready() invocation) to the ObserveMultiplexer, and you stop                                       // 27
// it by calling the stop() method.                                                                                   // 28
OplogObserveDriver = function (options) {                                                                             // 29
  var self = this;                                                                                                    // 30
  self._usesOplog = true;  // tests look at this                                                                      // 31
                                                                                                                      // 32
  self._cursorDescription = options.cursorDescription;                                                                // 33
  self._mongoHandle = options.mongoHandle;                                                                            // 34
  self._multiplexer = options.multiplexer;                                                                            // 35
                                                                                                                      // 36
  if (options.ordered) {                                                                                              // 37
    throw Error("OplogObserveDriver only supports unordered observeChanges");                                         // 38
  }                                                                                                                   // 39
                                                                                                                      // 40
  var sorter = options.sorter;                                                                                        // 41
  // We don't support $near and other geo-queries so it's OK to initialize the                                        // 42
  // comparator only once in the constructor.                                                                         // 43
  var comparator = sorter && sorter.getComparator();                                                                  // 44
                                                                                                                      // 45
  if (options.cursorDescription.options.limit) {                                                                      // 46
    // There are several properties ordered driver implements:                                                        // 47
    // - _limit is a positive number                                                                                  // 48
    // - _comparator is a function-comparator by which the query is ordered                                           // 49
    // - _unpublishedBuffer is non-null Min/Max Heap,                                                                 // 50
    //                      the empty buffer in STEADY phase implies that the                                         // 51
    //                      everything that matches the queries selector fits                                         // 52
    //                      into published set.                                                                       // 53
    // - _published - Min Heap (also implements IdMap methods)                                                        // 54
                                                                                                                      // 55
    var heapOptions = { IdMap: LocalCollection._IdMap };                                                              // 56
    self._limit = self._cursorDescription.options.limit;                                                              // 57
    self._comparator = comparator;                                                                                    // 58
    self._sorter = sorter;                                                                                            // 59
    self._unpublishedBuffer = new MinMaxHeap(comparator, heapOptions);                                                // 60
    // We need something that can find Max value in addition to IdMap interface                                       // 61
    self._published = new MaxHeap(comparator, heapOptions);                                                           // 62
  } else {                                                                                                            // 63
    self._limit = 0;                                                                                                  // 64
    self._comparator = null;                                                                                          // 65
    self._sorter = null;                                                                                              // 66
    self._unpublishedBuffer = null;                                                                                   // 67
    self._published = new LocalCollection._IdMap;                                                                     // 68
  }                                                                                                                   // 69
                                                                                                                      // 70
  // Indicates if it is safe to insert a new document at the end of the buffer                                        // 71
  // for this query. i.e. it is known that there are no documents matching the                                        // 72
  // selector those are not in published or buffer.                                                                   // 73
  self._safeAppendToBuffer = false;                                                                                   // 74
                                                                                                                      // 75
  self._stopped = false;                                                                                              // 76
  self._stopHandles = [];                                                                                             // 77
                                                                                                                      // 78
  Package.facts && Package.facts.Facts.incrementServerFact(                                                           // 79
    "mongo-livedata", "observe-drivers-oplog", 1);                                                                    // 80
                                                                                                                      // 81
  self._registerPhaseChange(PHASE.QUERYING);                                                                          // 82
                                                                                                                      // 83
  var selector = self._cursorDescription.selector;                                                                    // 84
  self._matcher = options.matcher;                                                                                    // 85
  var projection = self._cursorDescription.options.fields || {};                                                      // 86
  self._projectionFn = LocalCollection._compileProjection(projection);                                                // 87
  // Projection function, result of combining important fields for selector and                                       // 88
  // existing fields projection                                                                                       // 89
  self._sharedProjection = self._matcher.combineIntoProjection(projection);                                           // 90
  if (sorter)                                                                                                         // 91
    self._sharedProjection = sorter.combineIntoProjection(self._sharedProjection);                                    // 92
  self._sharedProjectionFn = LocalCollection._compileProjection(                                                      // 93
    self._sharedProjection);                                                                                          // 94
                                                                                                                      // 95
  self._needToFetch = new LocalCollection._IdMap;                                                                     // 96
  self._currentlyFetching = null;                                                                                     // 97
  self._fetchGeneration = 0;                                                                                          // 98
                                                                                                                      // 99
  self._requeryWhenDoneThisQuery = false;                                                                             // 100
  self._writesToCommitWhenWeReachSteady = [];                                                                         // 101
                                                                                                                      // 102
  // If the oplog handle tells us that it skipped some entries (because it got                                        // 103
  // behind, say), re-poll.                                                                                           // 104
  self._stopHandles.push(self._mongoHandle._oplogHandle.onSkippedEntries(                                             // 105
    finishIfNeedToPollQuery(function () {                                                                             // 106
      self._needToPollQuery();                                                                                        // 107
    })                                                                                                                // 108
  ));                                                                                                                 // 109
                                                                                                                      // 110
  forEachTrigger(self._cursorDescription, function (trigger) {                                                        // 111
    self._stopHandles.push(self._mongoHandle._oplogHandle.onOplogEntry(                                               // 112
      trigger, function (notification) {                                                                              // 113
        Meteor._noYieldsAllowed(finishIfNeedToPollQuery(function () {                                                 // 114
          var op = notification.op;                                                                                   // 115
          if (notification.dropCollection) {                                                                          // 116
            // Note: this call is not allowed to block on anything (especially                                        // 117
            // on waiting for oplog entries to catch up) because that will block                                      // 118
            // onOplogEntry!                                                                                          // 119
            self._needToPollQuery();                                                                                  // 120
          } else {                                                                                                    // 121
            // All other operators should be handled depending on phase                                               // 122
            if (self._phase === PHASE.QUERYING)                                                                       // 123
              self._handleOplogEntryQuerying(op);                                                                     // 124
            else                                                                                                      // 125
              self._handleOplogEntrySteadyOrFetching(op);                                                             // 126
          }                                                                                                           // 127
        }));                                                                                                          // 128
      }                                                                                                               // 129
    ));                                                                                                               // 130
  });                                                                                                                 // 131
                                                                                                                      // 132
  // XXX ordering w.r.t. everything else?                                                                             // 133
  self._stopHandles.push(listenAll(                                                                                   // 134
    self._cursorDescription, function (notification) {                                                                // 135
      // If we're not in a write fence, we don't have to do anything.                                                 // 136
      var fence = DDPServer._CurrentWriteFence.get();                                                                 // 137
      if (!fence)                                                                                                     // 138
        return;                                                                                                       // 139
      var write = fence.beginWrite();                                                                                 // 140
      // This write cannot complete until we've caught up to "this point" in the                                      // 141
      // oplog, and then made it back to the steady state.                                                            // 142
      Meteor.defer(function () {                                                                                      // 143
        self._mongoHandle._oplogHandle.waitUntilCaughtUp();                                                           // 144
        if (self._stopped) {                                                                                          // 145
          // We're stopped, so just immediately commit.                                                               // 146
          write.committed();                                                                                          // 147
        } else if (self._phase === PHASE.STEADY) {                                                                    // 148
          // Make sure that all of the callbacks have made it through the                                             // 149
          // multiplexer and been delivered to ObserveHandles before committing                                       // 150
          // writes.                                                                                                  // 151
          self._multiplexer.onFlush(function () {                                                                     // 152
            write.committed();                                                                                        // 153
          });                                                                                                         // 154
        } else {                                                                                                      // 155
          self._writesToCommitWhenWeReachSteady.push(write);                                                          // 156
        }                                                                                                             // 157
      });                                                                                                             // 158
    }                                                                                                                 // 159
  ));                                                                                                                 // 160
                                                                                                                      // 161
  // When Mongo fails over, we need to repoll the query, in case we processed an                                      // 162
  // oplog entry that got rolled back.                                                                                // 163
  self._stopHandles.push(self._mongoHandle._onFailover(finishIfNeedToPollQuery(                                       // 164
    function () {                                                                                                     // 165
      self._needToPollQuery();                                                                                        // 166
    })));                                                                                                             // 167
                                                                                                                      // 168
  // Give _observeChanges a chance to add the new ObserveHandle to our                                                // 169
  // multiplexer, so that the added calls get streamed.                                                               // 170
  Meteor.defer(finishIfNeedToPollQuery(function () {                                                                  // 171
    self._runInitialQuery();                                                                                          // 172
  }));                                                                                                                // 173
};                                                                                                                    // 174
                                                                                                                      // 175
_.extend(OplogObserveDriver.prototype, {                                                                              // 176
  _addPublished: function (id, doc) {                                                                                 // 177
    var self = this;                                                                                                  // 178
    Meteor._noYieldsAllowed(function () {                                                                             // 179
      var fields = _.clone(doc);                                                                                      // 180
      delete fields._id;                                                                                              // 181
      self._published.set(id, self._sharedProjectionFn(doc));                                                         // 182
      self._multiplexer.added(id, self._projectionFn(fields));                                                        // 183
                                                                                                                      // 184
      // After adding this document, the published set might be overflowed                                            // 185
      // (exceeding capacity specified by limit). If so, push the maximum                                             // 186
      // element to the buffer, we might want to save it in memory to reduce the                                      // 187
      // amount of Mongo lookups in the future.                                                                       // 188
      if (self._limit && self._published.size() > self._limit) {                                                      // 189
        // XXX in theory the size of published is no more than limit+1                                                // 190
        if (self._published.size() !== self._limit + 1) {                                                             // 191
          throw new Error("After adding to published, " +                                                             // 192
                          (self._published.size() - self._limit) +                                                    // 193
                          " documents are overflowing the set");                                                      // 194
        }                                                                                                             // 195
                                                                                                                      // 196
        var overflowingDocId = self._published.maxElementId();                                                        // 197
        var overflowingDoc = self._published.get(overflowingDocId);                                                   // 198
                                                                                                                      // 199
        if (EJSON.equals(overflowingDocId, id)) {                                                                     // 200
          throw new Error("The document just added is overflowing the published set");                                // 201
        }                                                                                                             // 202
                                                                                                                      // 203
        self._published.remove(overflowingDocId);                                                                     // 204
        self._multiplexer.removed(overflowingDocId);                                                                  // 205
        self._addBuffered(overflowingDocId, overflowingDoc);                                                          // 206
      }                                                                                                               // 207
    });                                                                                                               // 208
  },                                                                                                                  // 209
  _removePublished: function (id) {                                                                                   // 210
    var self = this;                                                                                                  // 211
    Meteor._noYieldsAllowed(function () {                                                                             // 212
      self._published.remove(id);                                                                                     // 213
      self._multiplexer.removed(id);                                                                                  // 214
      if (! self._limit || self._published.size() === self._limit)                                                    // 215
        return;                                                                                                       // 216
                                                                                                                      // 217
      if (self._published.size() > self._limit)                                                                       // 218
        throw Error("self._published got too big");                                                                   // 219
                                                                                                                      // 220
      // OK, we are publishing less than the limit. Maybe we should look in the                                       // 221
      // buffer to find the next element past what we were publishing before.                                         // 222
                                                                                                                      // 223
      if (!self._unpublishedBuffer.empty()) {                                                                         // 224
        // There's something in the buffer; move the first thing in it to                                             // 225
        // _published.                                                                                                // 226
        var newDocId = self._unpublishedBuffer.minElementId();                                                        // 227
        var newDoc = self._unpublishedBuffer.get(newDocId);                                                           // 228
        self._removeBuffered(newDocId);                                                                               // 229
        self._addPublished(newDocId, newDoc);                                                                         // 230
        return;                                                                                                       // 231
      }                                                                                                               // 232
                                                                                                                      // 233
      // There's nothing in the buffer.  This could mean one of a few things.                                         // 234
                                                                                                                      // 235
      // (a) We could be in the middle of re-running the query (specifically, we                                      // 236
      // could be in _publishNewResults). In that case, _unpublishedBuffer is                                         // 237
      // empty because we clear it at the beginning of _publishNewResults. In                                         // 238
      // this case, our caller already knows the entire answer to the query and                                       // 239
      // we don't need to do anything fancy here.  Just return.                                                       // 240
      if (self._phase === PHASE.QUERYING)                                                                             // 241
        return;                                                                                                       // 242
                                                                                                                      // 243
      // (b) We're pretty confident that the union of _published and                                                  // 244
      // _unpublishedBuffer contain all documents that match selector. Because                                        // 245
      // _unpublishedBuffer is empty, that means we're confident that _published                                      // 246
      // contains all documents that match selector. So we have nothing to do.                                        // 247
      if (self._safeAppendToBuffer)                                                                                   // 248
        return;                                                                                                       // 249
                                                                                                                      // 250
      // (c) Maybe there are other documents out there that should be in our                                          // 251
      // buffer. But in that case, when we emptied _unpublishedBuffer in                                              // 252
      // _removeBuffered, we should have called _needToPollQuery, which will                                          // 253
      // either put something in _unpublishedBuffer or set _safeAppendToBuffer                                        // 254
      // (or both), and it will put us in QUERYING for that whole time. So in                                         // 255
      // fact, we shouldn't be able to get here.                                                                      // 256
                                                                                                                      // 257
      throw new Error("Buffer inexplicably empty");                                                                   // 258
    });                                                                                                               // 259
  },                                                                                                                  // 260
  _changePublished: function (id, oldDoc, newDoc) {                                                                   // 261
    var self = this;                                                                                                  // 262
    Meteor._noYieldsAllowed(function () {                                                                             // 263
      self._published.set(id, self._sharedProjectionFn(newDoc));                                                      // 264
      var changed = LocalCollection._makeChangedFields(_.clone(newDoc), oldDoc);                                      // 265
      changed = self._projectionFn(changed);                                                                          // 266
      if (!_.isEmpty(changed))                                                                                        // 267
        self._multiplexer.changed(id, changed);                                                                       // 268
    });                                                                                                               // 269
  },                                                                                                                  // 270
  _addBuffered: function (id, doc) {                                                                                  // 271
    var self = this;                                                                                                  // 272
    Meteor._noYieldsAllowed(function () {                                                                             // 273
      self._unpublishedBuffer.set(id, self._sharedProjectionFn(doc));                                                 // 274
                                                                                                                      // 275
      // If something is overflowing the buffer, we just remove it from cache                                         // 276
      if (self._unpublishedBuffer.size() > self._limit) {                                                             // 277
        var maxBufferedId = self._unpublishedBuffer.maxElementId();                                                   // 278
                                                                                                                      // 279
        self._unpublishedBuffer.remove(maxBufferedId);                                                                // 280
                                                                                                                      // 281
        // Since something matching is removed from cache (both published set and                                     // 282
        // buffer), set flag to false                                                                                 // 283
        self._safeAppendToBuffer = false;                                                                             // 284
      }                                                                                                               // 285
    });                                                                                                               // 286
  },                                                                                                                  // 287
  // Is called either to remove the doc completely from matching set or to move                                       // 288
  // it to the published set later.                                                                                   // 289
  _removeBuffered: function (id) {                                                                                    // 290
    var self = this;                                                                                                  // 291
    Meteor._noYieldsAllowed(function () {                                                                             // 292
      self._unpublishedBuffer.remove(id);                                                                             // 293
      // To keep the contract "buffer is never empty in STEADY phase unless the                                       // 294
      // everything matching fits into published" true, we poll everything as                                         // 295
      // soon as we see the buffer becoming empty.                                                                    // 296
      if (! self._unpublishedBuffer.size() && ! self._safeAppendToBuffer)                                             // 297
        self._needToPollQuery();                                                                                      // 298
    });                                                                                                               // 299
  },                                                                                                                  // 300
  // Called when a document has joined the "Matching" results set.                                                    // 301
  // Takes responsibility of keeping _unpublishedBuffer in sync with _published                                       // 302
  // and the effect of limit enforced.                                                                                // 303
  _addMatching: function (doc) {                                                                                      // 304
    var self = this;                                                                                                  // 305
    Meteor._noYieldsAllowed(function () {                                                                             // 306
      var id = doc._id;                                                                                               // 307
      if (self._published.has(id))                                                                                    // 308
        throw Error("tried to add something already published " + id);                                                // 309
      if (self._limit && self._unpublishedBuffer.has(id))                                                             // 310
        throw Error("tried to add something already existed in buffer " + id);                                        // 311
                                                                                                                      // 312
      var limit = self._limit;                                                                                        // 313
      var comparator = self._comparator;                                                                              // 314
      var maxPublished = (limit && self._published.size() > 0) ?                                                      // 315
        self._published.get(self._published.maxElementId()) : null;                                                   // 316
      var maxBuffered = (limit && self._unpublishedBuffer.size() > 0)                                                 // 317
        ? self._unpublishedBuffer.get(self._unpublishedBuffer.maxElementId())                                         // 318
        : null;                                                                                                       // 319
      // The query is unlimited or didn't publish enough documents yet or the                                         // 320
      // new document would fit into published set pushing the maximum element                                        // 321
      // out, then we need to publish the doc.                                                                        // 322
      var toPublish = ! limit || self._published.size() < limit ||                                                    // 323
        comparator(doc, maxPublished) < 0;                                                                            // 324
                                                                                                                      // 325
      // Otherwise we might need to buffer it (only in case of limited query).                                        // 326
      // Buffering is allowed if the buffer is not filled up yet and all                                              // 327
      // matching docs are either in the published set or in the buffer.                                              // 328
      var canAppendToBuffer = !toPublish && self._safeAppendToBuffer &&                                               // 329
        self._unpublishedBuffer.size() < limit;                                                                       // 330
                                                                                                                      // 331
      // Or if it is small enough to be safely inserted to the middle or the                                          // 332
      // beginning of the buffer.                                                                                     // 333
      var canInsertIntoBuffer = !toPublish && maxBuffered &&                                                          // 334
        comparator(doc, maxBuffered) <= 0;                                                                            // 335
                                                                                                                      // 336
      var toBuffer = canAppendToBuffer || canInsertIntoBuffer;                                                        // 337
                                                                                                                      // 338
      if (toPublish) {                                                                                                // 339
        self._addPublished(id, doc);                                                                                  // 340
      } else if (toBuffer) {                                                                                          // 341
        self._addBuffered(id, doc);                                                                                   // 342
      } else {                                                                                                        // 343
        // dropping it and not saving to the cache                                                                    // 344
        self._safeAppendToBuffer = false;                                                                             // 345
      }                                                                                                               // 346
    });                                                                                                               // 347
  },                                                                                                                  // 348
  // Called when a document leaves the "Matching" results set.                                                        // 349
  // Takes responsibility of keeping _unpublishedBuffer in sync with _published                                       // 350
  // and the effect of limit enforced.                                                                                // 351
  _removeMatching: function (id) {                                                                                    // 352
    var self = this;                                                                                                  // 353
    Meteor._noYieldsAllowed(function () {                                                                             // 354
      if (! self._published.has(id) && ! self._limit)                                                                 // 355
        throw Error("tried to remove something matching but not cached " + id);                                       // 356
                                                                                                                      // 357
      if (self._published.has(id)) {                                                                                  // 358
        self._removePublished(id);                                                                                    // 359
      } else if (self._unpublishedBuffer.has(id)) {                                                                   // 360
        self._removeBuffered(id);                                                                                     // 361
      }                                                                                                               // 362
    });                                                                                                               // 363
  },                                                                                                                  // 364
  _handleDoc: function (id, newDoc) {                                                                                 // 365
    var self = this;                                                                                                  // 366
    Meteor._noYieldsAllowed(function () {                                                                             // 367
      var matchesNow = newDoc && self._matcher.documentMatches(newDoc).result;                                        // 368
                                                                                                                      // 369
      var publishedBefore = self._published.has(id);                                                                  // 370
      var bufferedBefore = self._limit && self._unpublishedBuffer.has(id);                                            // 371
      var cachedBefore = publishedBefore || bufferedBefore;                                                           // 372
                                                                                                                      // 373
      if (matchesNow && !cachedBefore) {                                                                              // 374
        self._addMatching(newDoc);                                                                                    // 375
      } else if (cachedBefore && !matchesNow) {                                                                       // 376
        self._removeMatching(id);                                                                                     // 377
      } else if (cachedBefore && matchesNow) {                                                                        // 378
        var oldDoc = self._published.get(id);                                                                         // 379
        var comparator = self._comparator;                                                                            // 380
        var minBuffered = self._limit && self._unpublishedBuffer.size() &&                                            // 381
          self._unpublishedBuffer.get(self._unpublishedBuffer.minElementId());                                        // 382
                                                                                                                      // 383
        if (publishedBefore) {                                                                                        // 384
          // Unlimited case where the document stays in published once it                                             // 385
          // matches or the case when we don't have enough matching docs to                                           // 386
          // publish or the changed but matching doc will stay in published                                           // 387
          // anyways.                                                                                                 // 388
          //                                                                                                          // 389
          // XXX: We rely on the emptiness of buffer. Be sure to maintain the                                         // 390
          // fact that buffer can't be empty if there are matching documents not                                      // 391
          // published. Notably, we don't want to schedule repoll and continue                                        // 392
          // relying on this property.                                                                                // 393
          var staysInPublished = ! self._limit ||                                                                     // 394
            self._unpublishedBuffer.size() === 0 ||                                                                   // 395
            comparator(newDoc, minBuffered) <= 0;                                                                     // 396
                                                                                                                      // 397
          if (staysInPublished) {                                                                                     // 398
            self._changePublished(id, oldDoc, newDoc);                                                                // 399
          } else {                                                                                                    // 400
            // after the change doc doesn't stay in the published, remove it                                          // 401
            self._removePublished(id);                                                                                // 402
            // but it can move into buffered now, check it                                                            // 403
            var maxBuffered = self._unpublishedBuffer.get(                                                            // 404
              self._unpublishedBuffer.maxElementId());                                                                // 405
                                                                                                                      // 406
            var toBuffer = self._safeAppendToBuffer ||                                                                // 407
                  (maxBuffered && comparator(newDoc, maxBuffered) <= 0);                                              // 408
                                                                                                                      // 409
            if (toBuffer) {                                                                                           // 410
              self._addBuffered(id, newDoc);                                                                          // 411
            } else {                                                                                                  // 412
              // Throw away from both published set and buffer                                                        // 413
              self._safeAppendToBuffer = false;                                                                       // 414
            }                                                                                                         // 415
          }                                                                                                           // 416
        } else if (bufferedBefore) {                                                                                  // 417
          oldDoc = self._unpublishedBuffer.get(id);                                                                   // 418
          // remove the old version manually instead of using _removeBuffered so                                      // 419
          // we don't trigger the querying immediately.  if we end this block                                         // 420
          // with the buffer empty, we will need to trigger the query poll                                            // 421
          // manually too.                                                                                            // 422
          self._unpublishedBuffer.remove(id);                                                                         // 423
                                                                                                                      // 424
          var maxPublished = self._published.get(                                                                     // 425
            self._published.maxElementId());                                                                          // 426
          var maxBuffered = self._unpublishedBuffer.size() &&                                                         // 427
                self._unpublishedBuffer.get(                                                                          // 428
                  self._unpublishedBuffer.maxElementId());                                                            // 429
                                                                                                                      // 430
          // the buffered doc was updated, it could move to published                                                 // 431
          var toPublish = comparator(newDoc, maxPublished) < 0;                                                       // 432
                                                                                                                      // 433
          // or stays in buffer even after the change                                                                 // 434
          var staysInBuffer = (! toPublish && self._safeAppendToBuffer) ||                                            // 435
                (!toPublish && maxBuffered &&                                                                         // 436
                 comparator(newDoc, maxBuffered) <= 0);                                                               // 437
                                                                                                                      // 438
          if (toPublish) {                                                                                            // 439
            self._addPublished(id, newDoc);                                                                           // 440
          } else if (staysInBuffer) {                                                                                 // 441
            // stays in buffer but changes                                                                            // 442
            self._unpublishedBuffer.set(id, newDoc);                                                                  // 443
          } else {                                                                                                    // 444
            // Throw away from both published set and buffer                                                          // 445
            self._safeAppendToBuffer = false;                                                                         // 446
            // Normally this check would have been done in _removeBuffered but                                        // 447
            // we didn't use it, so we need to do it ourself now.                                                     // 448
            if (! self._unpublishedBuffer.size()) {                                                                   // 449
              self._needToPollQuery();                                                                                // 450
            }                                                                                                         // 451
          }                                                                                                           // 452
        } else {                                                                                                      // 453
          throw new Error("cachedBefore implies either of publishedBefore or bufferedBefore is true.");               // 454
        }                                                                                                             // 455
      }                                                                                                               // 456
    });                                                                                                               // 457
  },                                                                                                                  // 458
  _fetchModifiedDocuments: function () {                                                                              // 459
    var self = this;                                                                                                  // 460
    Meteor._noYieldsAllowed(function () {                                                                             // 461
      self._registerPhaseChange(PHASE.FETCHING);                                                                      // 462
      // Defer, because nothing called from the oplog entry handler may yield,                                        // 463
      // but fetch() yields.                                                                                          // 464
      Meteor.defer(finishIfNeedToPollQuery(function () {                                                              // 465
        while (!self._stopped && !self._needToFetch.empty()) {                                                        // 466
          if (self._phase === PHASE.QUERYING) {                                                                       // 467
            // While fetching, we decided to go into QUERYING mode, and then we                                       // 468
            // saw another oplog entry, so _needToFetch is not empty. But we                                          // 469
            // shouldn't fetch these documents until AFTER the query is done.                                         // 470
            break;                                                                                                    // 471
          }                                                                                                           // 472
                                                                                                                      // 473
          // Being in steady phase here would be surprising.                                                          // 474
          if (self._phase !== PHASE.FETCHING)                                                                         // 475
            throw new Error("phase in fetchModifiedDocuments: " + self._phase);                                       // 476
                                                                                                                      // 477
          self._currentlyFetching = self._needToFetch;                                                                // 478
          var thisGeneration = ++self._fetchGeneration;                                                               // 479
          self._needToFetch = new LocalCollection._IdMap;                                                             // 480
          var waiting = 0;                                                                                            // 481
          var fut = new Future;                                                                                       // 482
          // This loop is safe, because _currentlyFetching will not be updated                                        // 483
          // during this loop (in fact, it is never mutated).                                                         // 484
          self._currentlyFetching.forEach(function (cacheKey, id) {                                                   // 485
            waiting++;                                                                                                // 486
            self._mongoHandle._docFetcher.fetch(                                                                      // 487
              self._cursorDescription.collectionName, id, cacheKey,                                                   // 488
              finishIfNeedToPollQuery(function (err, doc) {                                                           // 489
                try {                                                                                                 // 490
                  if (err) {                                                                                          // 491
                    Meteor._debug("Got exception while fetching documents: " +                                        // 492
                                  err);                                                                               // 493
                    // If we get an error from the fetcher (eg, trouble                                               // 494
                    // connecting to Mongo), let's just abandon the fetch phase                                       // 495
                    // altogether and fall back to polling. It's not like we're                                       // 496
                    // getting live updates anyway.                                                                   // 497
                    if (self._phase !== PHASE.QUERYING) {                                                             // 498
                      self._needToPollQuery();                                                                        // 499
                    }                                                                                                 // 500
                  } else if (!self._stopped && self._phase === PHASE.FETCHING                                         // 501
                             && self._fetchGeneration === thisGeneration) {                                           // 502
                    // We re-check the generation in case we've had an explicit                                       // 503
                    // _pollQuery call (eg, in another fiber) which should                                            // 504
                    // effectively cancel this round of fetches.  (_pollQuery                                         // 505
                    // increments the generation.)                                                                    // 506
                    self._handleDoc(id, doc);                                                                         // 507
                  }                                                                                                   // 508
                } finally {                                                                                           // 509
                  waiting--;                                                                                          // 510
                  // Because fetch() never calls its callback synchronously,                                          // 511
                  // this is safe (ie, we won't call fut.return() before the                                          // 512
                  // forEach is done).                                                                                // 513
                  if (waiting === 0)                                                                                  // 514
                    fut.return();                                                                                     // 515
                }                                                                                                     // 516
              }));                                                                                                    // 517
          });                                                                                                         // 518
          fut.wait();                                                                                                 // 519
          // Exit now if we've had a _pollQuery call (here or in another fiber).                                      // 520
          if (self._phase === PHASE.QUERYING)                                                                         // 521
            return;                                                                                                   // 522
          self._currentlyFetching = null;                                                                             // 523
        }                                                                                                             // 524
        // We're done fetching, so we can be steady, unless we've had a                                               // 525
        // _pollQuery call (here or in another fiber).                                                                // 526
        if (self._phase !== PHASE.QUERYING)                                                                           // 527
          self._beSteady();                                                                                           // 528
      }));                                                                                                            // 529
    });                                                                                                               // 530
  },                                                                                                                  // 531
  _beSteady: function () {                                                                                            // 532
    var self = this;                                                                                                  // 533
    Meteor._noYieldsAllowed(function () {                                                                             // 534
      self._registerPhaseChange(PHASE.STEADY);                                                                        // 535
      var writes = self._writesToCommitWhenWeReachSteady;                                                             // 536
      self._writesToCommitWhenWeReachSteady = [];                                                                     // 537
      self._multiplexer.onFlush(function () {                                                                         // 538
        _.each(writes, function (w) {                                                                                 // 539
          w.committed();                                                                                              // 540
        });                                                                                                           // 541
      });                                                                                                             // 542
    });                                                                                                               // 543
  },                                                                                                                  // 544
  _handleOplogEntryQuerying: function (op) {                                                                          // 545
    var self = this;                                                                                                  // 546
    Meteor._noYieldsAllowed(function () {                                                                             // 547
      self._needToFetch.set(idForOp(op), op.ts.toString());                                                           // 548
    });                                                                                                               // 549
  },                                                                                                                  // 550
  _handleOplogEntrySteadyOrFetching: function (op) {                                                                  // 551
    var self = this;                                                                                                  // 552
    Meteor._noYieldsAllowed(function () {                                                                             // 553
      var id = idForOp(op);                                                                                           // 554
      // If we're already fetching this one, or about to, we can't optimize;                                          // 555
      // make sure that we fetch it again if necessary.                                                               // 556
      if (self._phase === PHASE.FETCHING &&                                                                           // 557
          ((self._currentlyFetching && self._currentlyFetching.has(id)) ||                                            // 558
           self._needToFetch.has(id))) {                                                                              // 559
        self._needToFetch.set(id, op.ts.toString());                                                                  // 560
        return;                                                                                                       // 561
      }                                                                                                               // 562
                                                                                                                      // 563
      if (op.op === 'd') {                                                                                            // 564
        if (self._published.has(id) ||                                                                                // 565
            (self._limit && self._unpublishedBuffer.has(id)))                                                         // 566
          self._removeMatching(id);                                                                                   // 567
      } else if (op.op === 'i') {                                                                                     // 568
        if (self._published.has(id))                                                                                  // 569
          throw new Error("insert found for already-existing ID in published");                                       // 570
        if (self._unpublishedBuffer && self._unpublishedBuffer.has(id))                                               // 571
          throw new Error("insert found for already-existing ID in buffer");                                          // 572
                                                                                                                      // 573
        // XXX what if selector yields?  for now it can't but later it could                                          // 574
        // have $where                                                                                                // 575
        if (self._matcher.documentMatches(op.o).result)                                                               // 576
          self._addMatching(op.o);                                                                                    // 577
      } else if (op.op === 'u') {                                                                                     // 578
        // Is this a modifier ($set/$unset, which may require us to poll the                                          // 579
        // database to figure out if the whole document matches the selector) or                                      // 580
        // a replacement (in which case we can just directly re-evaluate the                                          // 581
        // selector)?                                                                                                 // 582
        var isReplace = !_.has(op.o, '$set') && !_.has(op.o, '$unset');                                               // 583
        // If this modifier modifies something inside an EJSON custom type (ie,                                       // 584
        // anything with EJSON$), then we can't try to use                                                            // 585
        // LocalCollection._modify, since that just mutates the EJSON encoding,                                       // 586
        // not the actual object.                                                                                     // 587
        var canDirectlyModifyDoc =                                                                                    // 588
          !isReplace && modifierCanBeDirectlyApplied(op.o);                                                           // 589
                                                                                                                      // 590
        var publishedBefore = self._published.has(id);                                                                // 591
        var bufferedBefore = self._limit && self._unpublishedBuffer.has(id);                                          // 592
                                                                                                                      // 593
        if (isReplace) {                                                                                              // 594
          self._handleDoc(id, _.extend({_id: id}, op.o));                                                             // 595
        } else if ((publishedBefore || bufferedBefore) &&                                                             // 596
                   canDirectlyModifyDoc) {                                                                            // 597
          // Oh great, we actually know what the document is, so we can apply                                         // 598
          // this directly.                                                                                           // 599
          var newDoc = self._published.has(id)                                                                        // 600
            ? self._published.get(id) : self._unpublishedBuffer.get(id);                                              // 601
          newDoc = EJSON.clone(newDoc);                                                                               // 602
                                                                                                                      // 603
          newDoc._id = id;                                                                                            // 604
          LocalCollection._modify(newDoc, op.o);                                                                      // 605
          self._handleDoc(id, self._sharedProjectionFn(newDoc));                                                      // 606
        } else if (!canDirectlyModifyDoc ||                                                                           // 607
                   self._matcher.canBecomeTrueByModifier(op.o) ||                                                     // 608
                   (self._sorter && self._sorter.affectedByModifier(op.o))) {                                         // 609
          self._needToFetch.set(id, op.ts.toString());                                                                // 610
          if (self._phase === PHASE.STEADY)                                                                           // 611
            self._fetchModifiedDocuments();                                                                           // 612
        }                                                                                                             // 613
      } else {                                                                                                        // 614
        throw Error("XXX SURPRISING OPERATION: " + op);                                                               // 615
      }                                                                                                               // 616
    });                                                                                                               // 617
  },                                                                                                                  // 618
  // Yields!                                                                                                          // 619
  _runInitialQuery: function () {                                                                                     // 620
    var self = this;                                                                                                  // 621
    if (self._stopped)                                                                                                // 622
      throw new Error("oplog stopped surprisingly early");                                                            // 623
                                                                                                                      // 624
    self._runQuery({initial: true});  // yields                                                                       // 625
                                                                                                                      // 626
    if (self._stopped)                                                                                                // 627
      return;  // can happen on queryError                                                                            // 628
                                                                                                                      // 629
    // Allow observeChanges calls to return. (After this, it's possible for                                           // 630
    // stop() to be called.)                                                                                          // 631
    self._multiplexer.ready();                                                                                        // 632
                                                                                                                      // 633
    self._doneQuerying();  // yields                                                                                  // 634
  },                                                                                                                  // 635
                                                                                                                      // 636
  // In various circumstances, we may just want to stop processing the oplog and                                      // 637
  // re-run the initial query, just as if we were a PollingObserveDriver.                                             // 638
  //                                                                                                                  // 639
  // This function may not block, because it is called from an oplog entry                                            // 640
  // handler.                                                                                                         // 641
  //                                                                                                                  // 642
  // XXX We should call this when we detect that we've been in FETCHING for "too                                      // 643
  // long".                                                                                                           // 644
  //                                                                                                                  // 645
  // XXX We should call this when we detect Mongo failover (since that might                                          // 646
  // mean that some of the oplog entries we have processed have been rolled                                           // 647
  // back). The Node Mongo driver is in the middle of a bunch of huge                                                 // 648
  // refactorings, including the way that it notifies you when primary                                                // 649
  // changes. Will put off implementing this until driver 1.4 is out.                                                 // 650
  _pollQuery: function () {                                                                                           // 651
    var self = this;                                                                                                  // 652
    Meteor._noYieldsAllowed(function () {                                                                             // 653
      if (self._stopped)                                                                                              // 654
        return;                                                                                                       // 655
                                                                                                                      // 656
      // Yay, we get to forget about all the things we thought we had to fetch.                                       // 657
      self._needToFetch = new LocalCollection._IdMap;                                                                 // 658
      self._currentlyFetching = null;                                                                                 // 659
      ++self._fetchGeneration;  // ignore any in-flight fetches                                                       // 660
      self._registerPhaseChange(PHASE.QUERYING);                                                                      // 661
                                                                                                                      // 662
      // Defer so that we don't yield.  We don't need finishIfNeedToPollQuery                                         // 663
      // here because SwitchedToQuery is not thrown in QUERYING mode.                                                 // 664
      Meteor.defer(function () {                                                                                      // 665
        self._runQuery();                                                                                             // 666
        self._doneQuerying();                                                                                         // 667
      });                                                                                                             // 668
    });                                                                                                               // 669
  },                                                                                                                  // 670
                                                                                                                      // 671
  // Yields!                                                                                                          // 672
  _runQuery: function (options) {                                                                                     // 673
    var self = this;                                                                                                  // 674
    options = options || {};                                                                                          // 675
    var newResults, newBuffer;                                                                                        // 676
                                                                                                                      // 677
    // This while loop is just to retry failures.                                                                     // 678
    while (true) {                                                                                                    // 679
      // If we've been stopped, we don't have to run anything any more.                                               // 680
      if (self._stopped)                                                                                              // 681
        return;                                                                                                       // 682
                                                                                                                      // 683
      newResults = new LocalCollection._IdMap;                                                                        // 684
      newBuffer = new LocalCollection._IdMap;                                                                         // 685
                                                                                                                      // 686
      // Query 2x documents as the half excluded from the original query will go                                      // 687
      // into unpublished buffer to reduce additional Mongo lookups in cases                                          // 688
      // when documents are removed from the published set and need a                                                 // 689
      // replacement.                                                                                                 // 690
      // XXX needs more thought on non-zero skip                                                                      // 691
      // XXX 2 is a "magic number" meaning there is an extra chunk of docs for                                        // 692
      // buffer if such is needed.                                                                                    // 693
      var cursor = self._cursorForQuery({ limit: self._limit * 2 });                                                  // 694
      try {                                                                                                           // 695
        cursor.forEach(function (doc, i) {  // yields                                                                 // 696
          if (!self._limit || i < self._limit)                                                                        // 697
            newResults.set(doc._id, doc);                                                                             // 698
          else                                                                                                        // 699
            newBuffer.set(doc._id, doc);                                                                              // 700
        });                                                                                                           // 701
        break;                                                                                                        // 702
      } catch (e) {                                                                                                   // 703
        if (options.initial && typeof(e.code) === 'number') {                                                         // 704
          // This is an error document sent to us by mongod, not a connection                                         // 705
          // error generated by the client. And we've never seen this query work                                      // 706
          // successfully. Probably it's a bad selector or something, so we                                           // 707
          // should NOT retry. Instead, we should halt the observe (which ends                                        // 708
          // up calling `stop` on us).                                                                                // 709
          self._multiplexer.queryError(e);                                                                            // 710
          return;                                                                                                     // 711
        }                                                                                                             // 712
                                                                                                                      // 713
        // During failover (eg) if we get an exception we should log and retry                                        // 714
        // instead of crashing.                                                                                       // 715
        Meteor._debug("Got exception while polling query: " + e);                                                     // 716
        Meteor._sleepForMs(100);                                                                                      // 717
      }                                                                                                               // 718
    }                                                                                                                 // 719
                                                                                                                      // 720
    if (self._stopped)                                                                                                // 721
      return;                                                                                                         // 722
                                                                                                                      // 723
    self._publishNewResults(newResults, newBuffer);                                                                   // 724
  },                                                                                                                  // 725
                                                                                                                      // 726
  // Transitions to QUERYING and runs another query, or (if already in QUERYING)                                      // 727
  // ensures that we will query again later.                                                                          // 728
  //                                                                                                                  // 729
  // This function may not block, because it is called from an oplog entry                                            // 730
  // handler. However, if we were not already in the QUERYING phase, it throws                                        // 731
  // an exception that is caught by the closest surrounding                                                           // 732
  // finishIfNeedToPollQuery call; this ensures that we don't continue running                                        // 733
  // close that was designed for another phase inside PHASE.QUERYING.                                                 // 734
  //                                                                                                                  // 735
  // (It's also necessary whenever logic in this file yields to check that other                                      // 736
  // phases haven't put us into QUERYING mode, though; eg,                                                            // 737
  // _fetchModifiedDocuments does this.)                                                                              // 738
  _needToPollQuery: function () {                                                                                     // 739
    var self = this;                                                                                                  // 740
    Meteor._noYieldsAllowed(function () {                                                                             // 741
      if (self._stopped)                                                                                              // 742
        return;                                                                                                       // 743
                                                                                                                      // 744
      // If we're not already in the middle of a query, we can query now                                              // 745
      // (possibly pausing FETCHING).                                                                                 // 746
      if (self._phase !== PHASE.QUERYING) {                                                                           // 747
        self._pollQuery();                                                                                            // 748
        throw new SwitchedToQuery;                                                                                    // 749
      }                                                                                                               // 750
                                                                                                                      // 751
      // We're currently in QUERYING. Set a flag to ensure that we run another                                        // 752
      // query when we're done.                                                                                       // 753
      self._requeryWhenDoneThisQuery = true;                                                                          // 754
    });                                                                                                               // 755
  },                                                                                                                  // 756
                                                                                                                      // 757
  // Yields!                                                                                                          // 758
  _doneQuerying: function () {                                                                                        // 759
    var self = this;                                                                                                  // 760
                                                                                                                      // 761
    if (self._stopped)                                                                                                // 762
      return;                                                                                                         // 763
    self._mongoHandle._oplogHandle.waitUntilCaughtUp();  // yields                                                    // 764
    if (self._stopped)                                                                                                // 765
      return;                                                                                                         // 766
    if (self._phase !== PHASE.QUERYING)                                                                               // 767
      throw Error("Phase unexpectedly " + self._phase);                                                               // 768
                                                                                                                      // 769
    Meteor._noYieldsAllowed(function () {                                                                             // 770
      if (self._requeryWhenDoneThisQuery) {                                                                           // 771
        self._requeryWhenDoneThisQuery = false;                                                                       // 772
        self._pollQuery();                                                                                            // 773
      } else if (self._needToFetch.empty()) {                                                                         // 774
        self._beSteady();                                                                                             // 775
      } else {                                                                                                        // 776
        self._fetchModifiedDocuments();                                                                               // 777
      }                                                                                                               // 778
    });                                                                                                               // 779
  },                                                                                                                  // 780
                                                                                                                      // 781
  _cursorForQuery: function (optionsOverwrite) {                                                                      // 782
    var self = this;                                                                                                  // 783
    return Meteor._noYieldsAllowed(function () {                                                                      // 784
      // The query we run is almost the same as the cursor we are observing,                                          // 785
      // with a few changes. We need to read all the fields that are relevant to                                      // 786
      // the selector, not just the fields we are going to publish (that's the                                        // 787
      // "shared" projection). And we don't want to apply any transform in the                                        // 788
      // cursor, because observeChanges shouldn't use the transform.                                                  // 789
      var options = _.clone(self._cursorDescription.options);                                                         // 790
                                                                                                                      // 791
      // Allow the caller to modify the options. Useful to specify different                                          // 792
      // skip and limit values.                                                                                       // 793
      _.extend(options, optionsOverwrite);                                                                            // 794
                                                                                                                      // 795
      options.fields = self._sharedProjection;                                                                        // 796
      delete options.transform;                                                                                       // 797
      // We are NOT deep cloning fields or selector here, which should be OK.                                         // 798
      var description = new CursorDescription(                                                                        // 799
        self._cursorDescription.collectionName,                                                                       // 800
        self._cursorDescription.selector,                                                                             // 801
        options);                                                                                                     // 802
      return new Cursor(self._mongoHandle, description);                                                              // 803
    });                                                                                                               // 804
  },                                                                                                                  // 805
                                                                                                                      // 806
                                                                                                                      // 807
  // Replace self._published with newResults (both are IdMaps), invoking observe                                      // 808
  // callbacks on the multiplexer.                                                                                    // 809
  // Replace self._unpublishedBuffer with newBuffer.                                                                  // 810
  //                                                                                                                  // 811
  // XXX This is very similar to LocalCollection._diffQueryUnorderedChanges. We                                       // 812
  // should really: (a) Unify IdMap and OrderedDict into Unordered/OrderedDict                                        // 813
  // (b) Rewrite diff.js to use these classes instead of arrays and objects.                                          // 814
  _publishNewResults: function (newResults, newBuffer) {                                                              // 815
    var self = this;                                                                                                  // 816
    Meteor._noYieldsAllowed(function () {                                                                             // 817
                                                                                                                      // 818
      // If the query is limited and there is a buffer, shut down so it doesn't                                       // 819
      // stay in a way.                                                                                               // 820
      if (self._limit) {                                                                                              // 821
        self._unpublishedBuffer.clear();                                                                              // 822
      }                                                                                                               // 823
                                                                                                                      // 824
      // First remove anything that's gone. Be careful not to modify                                                  // 825
      // self._published while iterating over it.                                                                     // 826
      var idsToRemove = [];                                                                                           // 827
      self._published.forEach(function (doc, id) {                                                                    // 828
        if (!newResults.has(id))                                                                                      // 829
          idsToRemove.push(id);                                                                                       // 830
      });                                                                                                             // 831
      _.each(idsToRemove, function (id) {                                                                             // 832
        self._removePublished(id);                                                                                    // 833
      });                                                                                                             // 834
                                                                                                                      // 835
      // Now do adds and changes.                                                                                     // 836
      // If self has a buffer and limit, the new fetched result will be                                               // 837
      // limited correctly as the query has sort specifier.                                                           // 838
      newResults.forEach(function (doc, id) {                                                                         // 839
        self._handleDoc(id, doc);                                                                                     // 840
      });                                                                                                             // 841
                                                                                                                      // 842
      // Sanity-check that everything we tried to put into _published ended up                                        // 843
      // there.                                                                                                       // 844
      // XXX if this is slow, remove it later                                                                         // 845
      if (self._published.size() !== newResults.size()) {                                                             // 846
        throw Error(                                                                                                  // 847
          "The Mongo server and the Meteor query disagree on how " +                                                  // 848
            "many documents match your query. Maybe it is hitting a Mongo " +                                         // 849
            "edge case? The query is: " +                                                                             // 850
            EJSON.stringify(self._cursorDescription.selector));                                                       // 851
      }                                                                                                               // 852
      self._published.forEach(function (doc, id) {                                                                    // 853
        if (!newResults.has(id))                                                                                      // 854
          throw Error("_published has a doc that newResults doesn't; " + id);                                         // 855
      });                                                                                                             // 856
                                                                                                                      // 857
      // Finally, replace the buffer                                                                                  // 858
      newBuffer.forEach(function (doc, id) {                                                                          // 859
        self._addBuffered(id, doc);                                                                                   // 860
      });                                                                                                             // 861
                                                                                                                      // 862
      self._safeAppendToBuffer = newBuffer.size() < self._limit;                                                      // 863
    });                                                                                                               // 864
  },                                                                                                                  // 865
                                                                                                                      // 866
  // This stop function is invoked from the onStop of the ObserveMultiplexer, so                                      // 867
  // it shouldn't actually be possible to call it until the multiplexer is                                            // 868
  // ready.                                                                                                           // 869
  //                                                                                                                  // 870
  // It's important to check self._stopped after every call in this file that                                         // 871
  // can yield!                                                                                                       // 872
  stop: function () {                                                                                                 // 873
    var self = this;                                                                                                  // 874
    if (self._stopped)                                                                                                // 875
      return;                                                                                                         // 876
    self._stopped = true;                                                                                             // 877
    _.each(self._stopHandles, function (handle) {                                                                     // 878
      handle.stop();                                                                                                  // 879
    });                                                                                                               // 880
                                                                                                                      // 881
    // Note: we *don't* use multiplexer.onFlush here because this stop                                                // 882
    // callback is actually invoked by the multiplexer itself when it has                                             // 883
    // determined that there are no handles left. So nothing is actually going                                        // 884
    // to get flushed (and it's probably not valid to call methods on the                                             // 885
    // dying multiplexer).                                                                                            // 886
    _.each(self._writesToCommitWhenWeReachSteady, function (w) {                                                      // 887
      w.committed();  // maybe yields?                                                                                // 888
    });                                                                                                               // 889
    self._writesToCommitWhenWeReachSteady = null;                                                                     // 890
                                                                                                                      // 891
    // Proactively drop references to potentially big things.                                                         // 892
    self._published = null;                                                                                           // 893
    self._unpublishedBuffer = null;                                                                                   // 894
    self._needToFetch = null;                                                                                         // 895
    self._currentlyFetching = null;                                                                                   // 896
    self._oplogEntryHandle = null;                                                                                    // 897
    self._listenersHandle = null;                                                                                     // 898
                                                                                                                      // 899
    Package.facts && Package.facts.Facts.incrementServerFact(                                                         // 900
      "mongo-livedata", "observe-drivers-oplog", -1);                                                                 // 901
  },                                                                                                                  // 902
                                                                                                                      // 903
  _registerPhaseChange: function (phase) {                                                                            // 904
    var self = this;                                                                                                  // 905
    Meteor._noYieldsAllowed(function () {                                                                             // 906
      var now = new Date;                                                                                             // 907
                                                                                                                      // 908
      if (self._phase) {                                                                                              // 909
        var timeDiff = now - self._phaseStartTime;                                                                    // 910
        Package.facts && Package.facts.Facts.incrementServerFact(                                                     // 911
          "mongo-livedata", "time-spent-in-" + self._phase + "-phase", timeDiff);                                     // 912
      }                                                                                                               // 913
                                                                                                                      // 914
      self._phase = phase;                                                                                            // 915
      self._phaseStartTime = now;                                                                                     // 916
    });                                                                                                               // 917
  }                                                                                                                   // 918
});                                                                                                                   // 919
                                                                                                                      // 920
// Does our oplog tailing code support this cursor? For now, we are being very                                        // 921
// conservative and allowing only simple queries with simple options.                                                 // 922
// (This is a "static method".)                                                                                       // 923
OplogObserveDriver.cursorSupported = function (cursorDescription, matcher) {                                          // 924
  // First, check the options.                                                                                        // 925
  var options = cursorDescription.options;                                                                            // 926
                                                                                                                      // 927
  // Did the user say no explicitly?                                                                                  // 928
  if (options._disableOplog)                                                                                          // 929
    return false;                                                                                                     // 930
                                                                                                                      // 931
  // skip is not supported: to support it we would need to keep track of all                                          // 932
  // "skipped" documents or at least their ids.                                                                       // 933
  // limit w/o a sort specifier is not supported: current implementation needs a                                      // 934
  // deterministic way to order documents.                                                                            // 935
  if (options.skip || (options.limit && !options.sort)) return false;                                                 // 936
                                                                                                                      // 937
  // If a fields projection option is given check if it is supported by                                               // 938
  // minimongo (some operators are not supported).                                                                    // 939
  if (options.fields) {                                                                                               // 940
    try {                                                                                                             // 941
      LocalCollection._checkSupportedProjection(options.fields);                                                      // 942
    } catch (e) {                                                                                                     // 943
      if (e.name === "MinimongoError")                                                                                // 944
        return false;                                                                                                 // 945
      else                                                                                                            // 946
        throw e;                                                                                                      // 947
    }                                                                                                                 // 948
  }                                                                                                                   // 949
                                                                                                                      // 950
  // We don't allow the following selectors:                                                                          // 951
  //   - $where (not confident that we provide the same JS environment                                                // 952
  //             as Mongo, and can yield!)                                                                            // 953
  //   - $near (has "interesting" properties in MongoDB, like the possibility                                         // 954
  //            of returning an ID multiple times, though even polling maybe                                          // 955
  //            have a bug there)                                                                                     // 956
  //           XXX: once we support it, we would need to think more on how we                                         // 957
  //           initialize the comparators when we create the driver.                                                  // 958
  return !matcher.hasWhere() && !matcher.hasGeoQuery();                                                               // 959
};                                                                                                                    // 960
                                                                                                                      // 961
var modifierCanBeDirectlyApplied = function (modifier) {                                                              // 962
  return _.all(modifier, function (fields, operation) {                                                               // 963
    return _.all(fields, function (value, field) {                                                                    // 964
      return !/EJSON\$/.test(field);                                                                                  // 965
    });                                                                                                               // 966
  });                                                                                                                 // 967
};                                                                                                                    // 968
                                                                                                                      // 969
MongoInternals.OplogObserveDriver = OplogObserveDriver;                                                               // 970
                                                                                                                      // 971
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/mongo/local_collection_driver.js                                                                          //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
LocalCollectionDriver = function () {                                                                                 // 1
  var self = this;                                                                                                    // 2
  self.noConnCollections = {};                                                                                        // 3
};                                                                                                                    // 4
                                                                                                                      // 5
var ensureCollection = function (name, collections) {                                                                 // 6
  if (!(name in collections))                                                                                         // 7
    collections[name] = new LocalCollection(name);                                                                    // 8
  return collections[name];                                                                                           // 9
};                                                                                                                    // 10
                                                                                                                      // 11
_.extend(LocalCollectionDriver.prototype, {                                                                           // 12
  open: function (name, conn) {                                                                                       // 13
    var self = this;                                                                                                  // 14
    if (!name)                                                                                                        // 15
      return new LocalCollection;                                                                                     // 16
    if (! conn) {                                                                                                     // 17
      return ensureCollection(name, self.noConnCollections);                                                          // 18
    }                                                                                                                 // 19
    if (! conn._mongo_livedata_collections)                                                                           // 20
      conn._mongo_livedata_collections = {};                                                                          // 21
    // XXX is there a way to keep track of a connection's collections without                                         // 22
    // dangling it off the connection object?                                                                         // 23
    return ensureCollection(name, conn._mongo_livedata_collections);                                                  // 24
  }                                                                                                                   // 25
});                                                                                                                   // 26
                                                                                                                      // 27
// singleton                                                                                                          // 28
LocalCollectionDriver = new LocalCollectionDriver;                                                                    // 29
                                                                                                                      // 30
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/mongo/remote_collection_driver.js                                                                         //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
MongoInternals.RemoteCollectionDriver = function (                                                                    // 1
  mongo_url, options) {                                                                                               // 2
  var self = this;                                                                                                    // 3
  self.mongo = new MongoConnection(mongo_url, options);                                                               // 4
};                                                                                                                    // 5
                                                                                                                      // 6
_.extend(MongoInternals.RemoteCollectionDriver.prototype, {                                                           // 7
  open: function (name) {                                                                                             // 8
    var self = this;                                                                                                  // 9
    var ret = {};                                                                                                     // 10
    _.each(                                                                                                           // 11
      ['find', 'findOne', 'insert', 'update', 'upsert',                                                               // 12
       'remove', '_ensureIndex', '_dropIndex', '_createCappedCollection',                                             // 13
       'dropCollection'],                                                                                             // 14
      function (m) {                                                                                                  // 15
        ret[m] = _.bind(self.mongo[m], self.mongo, name);                                                             // 16
      });                                                                                                             // 17
    return ret;                                                                                                       // 18
  }                                                                                                                   // 19
});                                                                                                                   // 20
                                                                                                                      // 21
                                                                                                                      // 22
// Create the singleton RemoteCollectionDriver only on demand, so we                                                  // 23
// only require Mongo configuration if it's actually used (eg, not if                                                 // 24
// you're only trying to receive data from a remote DDP server.)                                                      // 25
MongoInternals.defaultRemoteCollectionDriver = _.once(function () {                                                   // 26
  var connectionOptions = {};                                                                                         // 27
                                                                                                                      // 28
  var mongoUrl = process.env.MONGO_URL;                                                                               // 29
                                                                                                                      // 30
  if (process.env.MONGO_OPLOG_URL) {                                                                                  // 31
    connectionOptions.oplogUrl = process.env.MONGO_OPLOG_URL;                                                         // 32
  }                                                                                                                   // 33
                                                                                                                      // 34
  if (! mongoUrl)                                                                                                     // 35
    throw new Error("MONGO_URL must be set in environment");                                                          // 36
                                                                                                                      // 37
  return new MongoInternals.RemoteCollectionDriver(mongoUrl, connectionOptions);                                      // 38
});                                                                                                                   // 39
                                                                                                                      // 40
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/mongo/collection.js                                                                                       //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
// options.connection, if given, is a LivedataClient or LivedataServer                                                // 1
// XXX presently there is no way to destroy/clean up a Collection                                                     // 2
                                                                                                                      // 3
/**                                                                                                                   // 4
 * @summary Namespace for MongoDB-related items                                                                       // 5
 * @namespace                                                                                                         // 6
 */                                                                                                                   // 7
Mongo = {};                                                                                                           // 8
                                                                                                                      // 9
/**                                                                                                                   // 10
 * @summary Constructor for a Collection                                                                              // 11
 * @locus Anywhere                                                                                                    // 12
 * @instancename collection                                                                                           // 13
 * @class                                                                                                             // 14
 * @param {String} name The name of the collection.  If null, creates an unmanaged (unsynchronized) local collection. // 15
 * @param {Object} [options]                                                                                          // 16
 * @param {Object} options.connection The server connection that will manage this collection. Uses the default connection if not specified.  Pass the return value of calling [`DDP.connect`](#ddp_connect) to specify a different server. Pass `null` to specify no connection. Unmanaged (`name` is null) collections cannot specify a connection.
 * @param {String} options.idGeneration The method of generating the `_id` fields of new documents in this collection.  Possible values:
                                                                                                                      // 19
 - **`'STRING'`**: random strings                                                                                     // 20
 - **`'MONGO'`**:  random [`Mongo.ObjectID`](#mongo_object_id) values                                                 // 21
                                                                                                                      // 22
The default id generation technique is `'STRING'`.                                                                    // 23
 * @param {Function} options.transform An optional transformation function. Documents will be passed through this function before being returned from `fetch` or `findOne`, and before being passed to callbacks of `observe`, `map`, `forEach`, `allow`, and `deny`. Transforms are *not* applied for the callbacks of `observeChanges` or to cursors returned from publish functions.
 */                                                                                                                   // 25
Mongo.Collection = function (name, options) {                                                                         // 26
  var self = this;                                                                                                    // 27
  if (! (self instanceof Mongo.Collection))                                                                           // 28
    throw new Error('use "new" to construct a Mongo.Collection');                                                     // 29
                                                                                                                      // 30
  if (!name && (name !== null)) {                                                                                     // 31
    Meteor._debug("Warning: creating anonymous collection. It will not be " +                                         // 32
                  "saved or synchronized over the network. (Pass null for " +                                         // 33
                  "the collection name to turn off this warning.)");                                                  // 34
    name = null;                                                                                                      // 35
  }                                                                                                                   // 36
                                                                                                                      // 37
  if (name !== null && typeof name !== "string") {                                                                    // 38
    throw new Error(                                                                                                  // 39
      "First argument to new Mongo.Collection must be a string or null");                                             // 40
  }                                                                                                                   // 41
                                                                                                                      // 42
  if (options && options.methods) {                                                                                   // 43
    // Backwards compatibility hack with original signature (which passed                                             // 44
    // "connection" directly instead of in options. (Connections must have a "methods"                                // 45
    // method.)                                                                                                       // 46
    // XXX remove before 1.0                                                                                          // 47
    options = {connection: options};                                                                                  // 48
  }                                                                                                                   // 49
  // Backwards compatibility: "connection" used to be called "manager".                                               // 50
  if (options && options.manager && !options.connection) {                                                            // 51
    options.connection = options.manager;                                                                             // 52
  }                                                                                                                   // 53
  options = _.extend({                                                                                                // 54
    connection: undefined,                                                                                            // 55
    idGeneration: 'STRING',                                                                                           // 56
    transform: null,                                                                                                  // 57
    _driver: undefined,                                                                                               // 58
    _preventAutopublish: false                                                                                        // 59
  }, options);                                                                                                        // 60
                                                                                                                      // 61
  switch (options.idGeneration) {                                                                                     // 62
  case 'MONGO':                                                                                                       // 63
    self._makeNewID = function () {                                                                                   // 64
      var src = name ? DDP.randomStream('/collection/' + name) : Random;                                              // 65
      return new Mongo.ObjectID(src.hexString(24));                                                                   // 66
    };                                                                                                                // 67
    break;                                                                                                            // 68
  case 'STRING':                                                                                                      // 69
  default:                                                                                                            // 70
    self._makeNewID = function () {                                                                                   // 71
      var src = name ? DDP.randomStream('/collection/' + name) : Random;                                              // 72
      return src.id();                                                                                                // 73
    };                                                                                                                // 74
    break;                                                                                                            // 75
  }                                                                                                                   // 76
                                                                                                                      // 77
  self._transform = LocalCollection.wrapTransform(options.transform);                                                 // 78
                                                                                                                      // 79
  if (! name || options.connection === null)                                                                          // 80
    // note: nameless collections never have a connection                                                             // 81
    self._connection = null;                                                                                          // 82
  else if (options.connection)                                                                                        // 83
    self._connection = options.connection;                                                                            // 84
  else if (Meteor.isClient)                                                                                           // 85
    self._connection = Meteor.connection;                                                                             // 86
  else                                                                                                                // 87
    self._connection = Meteor.server;                                                                                 // 88
                                                                                                                      // 89
  if (!options._driver) {                                                                                             // 90
    // XXX This check assumes that webapp is loaded so that Meteor.server !==                                         // 91
    // null. We should fully support the case of "want to use a Mongo-backed                                          // 92
    // collection from Node code without webapp", but we don't yet.                                                   // 93
    // #MeteorServerNull                                                                                              // 94
    if (name && self._connection === Meteor.server &&                                                                 // 95
        typeof MongoInternals !== "undefined" &&                                                                      // 96
        MongoInternals.defaultRemoteCollectionDriver) {                                                               // 97
      options._driver = MongoInternals.defaultRemoteCollectionDriver();                                               // 98
    } else {                                                                                                          // 99
      options._driver = LocalCollectionDriver;                                                                        // 100
    }                                                                                                                 // 101
  }                                                                                                                   // 102
                                                                                                                      // 103
  self._collection = options._driver.open(name, self._connection);                                                    // 104
  self._name = name;                                                                                                  // 105
                                                                                                                      // 106
  if (self._connection && self._connection.registerStore) {                                                           // 107
    // OK, we're going to be a slave, replicating some remote                                                         // 108
    // database, except possibly with some temporary divergence while                                                 // 109
    // we have unacknowledged RPC's.                                                                                  // 110
    var ok = self._connection.registerStore(name, {                                                                   // 111
      // Called at the beginning of a batch of updates. batchSize is the number                                       // 112
      // of update calls to expect.                                                                                   // 113
      //                                                                                                              // 114
      // XXX This interface is pretty janky. reset probably ought to go back to                                       // 115
      // being its own function, and callers shouldn't have to calculate                                              // 116
      // batchSize. The optimization of not calling pause/remove should be                                            // 117
      // delayed until later: the first call to update() should buffer its                                            // 118
      // message, and then we can either directly apply it at endUpdate time if                                       // 119
      // it was the only update, or do pauseObservers/apply/apply at the next                                         // 120
      // update() if there's another one.                                                                             // 121
      beginUpdate: function (batchSize, reset) {                                                                      // 122
        // pause observers so users don't see flicker when updating several                                           // 123
        // objects at once (including the post-reconnect reset-and-reapply                                            // 124
        // stage), and so that a re-sorting of a query can take advantage of the                                      // 125
        // full _diffQuery moved calculation instead of applying change one at a                                      // 126
        // time.                                                                                                      // 127
        if (batchSize > 1 || reset)                                                                                   // 128
          self._collection.pauseObservers();                                                                          // 129
                                                                                                                      // 130
        if (reset)                                                                                                    // 131
          self._collection.remove({});                                                                                // 132
      },                                                                                                              // 133
                                                                                                                      // 134
      // Apply an update.                                                                                             // 135
      // XXX better specify this interface (not in terms of a wire message)?                                          // 136
      update: function (msg) {                                                                                        // 137
        var mongoId = LocalCollection._idParse(msg.id);                                                               // 138
        var doc = self._collection.findOne(mongoId);                                                                  // 139
                                                                                                                      // 140
        // Is this a "replace the whole doc" message coming from the quiescence                                       // 141
        // of method writes to an object? (Note that 'undefined' is a valid                                           // 142
        // value meaning "remove it".)                                                                                // 143
        if (msg.msg === 'replace') {                                                                                  // 144
          var replace = msg.replace;                                                                                  // 145
          if (!replace) {                                                                                             // 146
            if (doc)                                                                                                  // 147
              self._collection.remove(mongoId);                                                                       // 148
          } else if (!doc) {                                                                                          // 149
            self._collection.insert(replace);                                                                         // 150
          } else {                                                                                                    // 151
            // XXX check that replace has no $ ops                                                                    // 152
            self._collection.update(mongoId, replace);                                                                // 153
          }                                                                                                           // 154
          return;                                                                                                     // 155
        } else if (msg.msg === 'added') {                                                                             // 156
          if (doc) {                                                                                                  // 157
            throw new Error("Expected not to find a document already present for an add");                            // 158
          }                                                                                                           // 159
          self._collection.insert(_.extend({_id: mongoId}, msg.fields));                                              // 160
        } else if (msg.msg === 'removed') {                                                                           // 161
          if (!doc)                                                                                                   // 162
            throw new Error("Expected to find a document already present for removed");                               // 163
          self._collection.remove(mongoId);                                                                           // 164
        } else if (msg.msg === 'changed') {                                                                           // 165
          if (!doc)                                                                                                   // 166
            throw new Error("Expected to find a document to change");                                                 // 167
          if (!_.isEmpty(msg.fields)) {                                                                               // 168
            var modifier = {};                                                                                        // 169
            _.each(msg.fields, function (value, key) {                                                                // 170
              if (value === undefined) {                                                                              // 171
                if (!modifier.$unset)                                                                                 // 172
                  modifier.$unset = {};                                                                               // 173
                modifier.$unset[key] = 1;                                                                             // 174
              } else {                                                                                                // 175
                if (!modifier.$set)                                                                                   // 176
                  modifier.$set = {};                                                                                 // 177
                modifier.$set[key] = value;                                                                           // 178
              }                                                                                                       // 179
            });                                                                                                       // 180
            self._collection.update(mongoId, modifier);                                                               // 181
          }                                                                                                           // 182
        } else {                                                                                                      // 183
          throw new Error("I don't know how to deal with this message");                                              // 184
        }                                                                                                             // 185
                                                                                                                      // 186
      },                                                                                                              // 187
                                                                                                                      // 188
      // Called at the end of a batch of updates.                                                                     // 189
      endUpdate: function () {                                                                                        // 190
        self._collection.resumeObservers();                                                                           // 191
      },                                                                                                              // 192
                                                                                                                      // 193
      // Called around method stub invocations to capture the original versions                                       // 194
      // of modified documents.                                                                                       // 195
      saveOriginals: function () {                                                                                    // 196
        self._collection.saveOriginals();                                                                             // 197
      },                                                                                                              // 198
      retrieveOriginals: function () {                                                                                // 199
        return self._collection.retrieveOriginals();                                                                  // 200
      }                                                                                                               // 201
    });                                                                                                               // 202
                                                                                                                      // 203
    if (!ok)                                                                                                          // 204
      throw new Error("There is already a collection named '" + name + "'");                                          // 205
  }                                                                                                                   // 206
                                                                                                                      // 207
  self._defineMutationMethods();                                                                                      // 208
                                                                                                                      // 209
  // autopublish                                                                                                      // 210
  if (Package.autopublish && !options._preventAutopublish && self._connection                                         // 211
      && self._connection.publish) {                                                                                  // 212
    self._connection.publish(null, function () {                                                                      // 213
      return self.find();                                                                                             // 214
    }, {is_auto: true});                                                                                              // 215
  }                                                                                                                   // 216
};                                                                                                                    // 217
                                                                                                                      // 218
///                                                                                                                   // 219
/// Main collection API                                                                                               // 220
///                                                                                                                   // 221
                                                                                                                      // 222
                                                                                                                      // 223
_.extend(Mongo.Collection.prototype, {                                                                                // 224
                                                                                                                      // 225
  _getFindSelector: function (args) {                                                                                 // 226
    if (args.length == 0)                                                                                             // 227
      return {};                                                                                                      // 228
    else                                                                                                              // 229
      return args[0];                                                                                                 // 230
  },                                                                                                                  // 231
                                                                                                                      // 232
  _getFindOptions: function (args) {                                                                                  // 233
    var self = this;                                                                                                  // 234
    if (args.length < 2) {                                                                                            // 235
      return { transform: self._transform };                                                                          // 236
    } else {                                                                                                          // 237
      check(args[1], Match.Optional(Match.ObjectIncluding({                                                           // 238
        fields: Match.Optional(Match.OneOf(Object, undefined)),                                                       // 239
        sort: Match.Optional(Match.OneOf(Object, Array, undefined)),                                                  // 240
        limit: Match.Optional(Match.OneOf(Number, undefined)),                                                        // 241
        skip: Match.Optional(Match.OneOf(Number, undefined))                                                          // 242
     })));                                                                                                            // 243
                                                                                                                      // 244
      return _.extend({                                                                                               // 245
        transform: self._transform                                                                                    // 246
      }, args[1]);                                                                                                    // 247
    }                                                                                                                 // 248
  },                                                                                                                  // 249
                                                                                                                      // 250
  /**                                                                                                                 // 251
   * @summary Find the documents in a collection that match the selector.                                             // 252
   * @locus Anywhere                                                                                                  // 253
   * @method find                                                                                                     // 254
   * @memberOf Mongo.Collection                                                                                       // 255
   * @instance                                                                                                        // 256
   * @param {MongoSelector} [selector] A query describing the documents to find                                       // 257
   * @param {Object} [options]                                                                                        // 258
   * @param {MongoSortSpecifier} options.sort Sort order (default: natural order)                                     // 259
   * @param {Number} options.skip Number of results to skip at the beginning                                          // 260
   * @param {Number} options.limit Maximum number of results to return                                                // 261
   * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.                           // 262
   * @param {Boolean} options.reactive (Client only) Default `true`; pass `false` to disable reactivity               // 263
   * @param {Function} options.transform Overrides `transform` on the  [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation.
   * @returns {Mongo.Cursor}                                                                                          // 265
   */                                                                                                                 // 266
  find: function (/* selector, options */) {                                                                          // 267
    // Collection.find() (return all docs) behaves differently                                                        // 268
    // from Collection.find(undefined) (return 0 docs).  so be                                                        // 269
    // careful about the length of arguments.                                                                         // 270
    var self = this;                                                                                                  // 271
    var argArray = _.toArray(arguments);                                                                              // 272
    return self._collection.find(self._getFindSelector(argArray),                                                     // 273
                                 self._getFindOptions(argArray));                                                     // 274
  },                                                                                                                  // 275
                                                                                                                      // 276
  /**                                                                                                                 // 277
   * @summary Finds the first document that matches the selector, as ordered by sort and skip options.                // 278
   * @locus Anywhere                                                                                                  // 279
   * @method findOne                                                                                                  // 280
   * @memberOf Mongo.Collection                                                                                       // 281
   * @instance                                                                                                        // 282
   * @param {MongoSelector} [selector] A query describing the documents to find                                       // 283
   * @param {Object} [options]                                                                                        // 284
   * @param {MongoSortSpecifier} options.sort Sort order (default: natural order)                                     // 285
   * @param {Number} options.skip Number of results to skip at the beginning                                          // 286
   * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.                           // 287
   * @param {Boolean} options.reactive (Client only) Default true; pass false to disable reactivity                   // 288
   * @param {Function} options.transform Overrides `transform` on the [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation.
   * @returns {Object}                                                                                                // 290
   */                                                                                                                 // 291
  findOne: function (/* selector, options */) {                                                                       // 292
    var self = this;                                                                                                  // 293
    var argArray = _.toArray(arguments);                                                                              // 294
    return self._collection.findOne(self._getFindSelector(argArray),                                                  // 295
                                    self._getFindOptions(argArray));                                                  // 296
  }                                                                                                                   // 297
                                                                                                                      // 298
});                                                                                                                   // 299
                                                                                                                      // 300
Mongo.Collection._publishCursor = function (cursor, sub, collection) {                                                // 301
  var observeHandle = cursor.observeChanges({                                                                         // 302
    added: function (id, fields) {                                                                                    // 303
      sub.added(collection, id, fields);                                                                              // 304
    },                                                                                                                // 305
    changed: function (id, fields) {                                                                                  // 306
      sub.changed(collection, id, fields);                                                                            // 307
    },                                                                                                                // 308
    removed: function (id) {                                                                                          // 309
      sub.removed(collection, id);                                                                                    // 310
    }                                                                                                                 // 311
  });                                                                                                                 // 312
                                                                                                                      // 313
  // We don't call sub.ready() here: it gets called in livedata_server, after                                         // 314
  // possibly calling _publishCursor on multiple returned cursors.                                                    // 315
                                                                                                                      // 316
  // register stop callback (expects lambda w/ no args).                                                              // 317
  sub.onStop(function () {observeHandle.stop();});                                                                    // 318
};                                                                                                                    // 319
                                                                                                                      // 320
// protect against dangerous selectors.  falsey and {_id: falsey} are both                                            // 321
// likely programmer error, and not what you want, particularly for destructive                                       // 322
// operations.  JS regexps don't serialize over DDP but can be trivially                                              // 323
// replaced by $regex.                                                                                                // 324
Mongo.Collection._rewriteSelector = function (selector) {                                                             // 325
  // shorthand -- scalars match _id                                                                                   // 326
  if (LocalCollection._selectorIsId(selector))                                                                        // 327
    selector = {_id: selector};                                                                                       // 328
                                                                                                                      // 329
  if (!selector || (('_id' in selector) && !selector._id))                                                            // 330
    // can't match anything                                                                                           // 331
    return {_id: Random.id()};                                                                                        // 332
                                                                                                                      // 333
  var ret = {};                                                                                                       // 334
  _.each(selector, function (value, key) {                                                                            // 335
    // Mongo supports both {field: /foo/} and {field: {$regex: /foo/}}                                                // 336
    if (value instanceof RegExp) {                                                                                    // 337
      ret[key] = convertRegexpToMongoSelector(value);                                                                 // 338
    } else if (value && value.$regex instanceof RegExp) {                                                             // 339
      ret[key] = convertRegexpToMongoSelector(value.$regex);                                                          // 340
      // if value is {$regex: /foo/, $options: ...} then $options                                                     // 341
      // override the ones set on $regex.                                                                             // 342
      if (value.$options !== undefined)                                                                               // 343
        ret[key].$options = value.$options;                                                                           // 344
    }                                                                                                                 // 345
    else if (_.contains(['$or','$and','$nor'], key)) {                                                                // 346
      // Translate lower levels of $and/$or/$nor                                                                      // 347
      ret[key] = _.map(value, function (v) {                                                                          // 348
        return Mongo.Collection._rewriteSelector(v);                                                                  // 349
      });                                                                                                             // 350
    } else {                                                                                                          // 351
      ret[key] = value;                                                                                               // 352
    }                                                                                                                 // 353
  });                                                                                                                 // 354
  return ret;                                                                                                         // 355
};                                                                                                                    // 356
                                                                                                                      // 357
// convert a JS RegExp object to a Mongo {$regex: ..., $options: ...}                                                 // 358
// selector                                                                                                           // 359
var convertRegexpToMongoSelector = function (regexp) {                                                                // 360
  check(regexp, RegExp); // safety belt                                                                               // 361
                                                                                                                      // 362
  var selector = {$regex: regexp.source};                                                                             // 363
  var regexOptions = '';                                                                                              // 364
  // JS RegExp objects support 'i', 'm', and 'g'. Mongo regex $options                                                // 365
  // support 'i', 'm', 'x', and 's'. So we support 'i' and 'm' here.                                                  // 366
  if (regexp.ignoreCase)                                                                                              // 367
    regexOptions += 'i';                                                                                              // 368
  if (regexp.multiline)                                                                                               // 369
    regexOptions += 'm';                                                                                              // 370
  if (regexOptions)                                                                                                   // 371
    selector.$options = regexOptions;                                                                                 // 372
                                                                                                                      // 373
  return selector;                                                                                                    // 374
};                                                                                                                    // 375
                                                                                                                      // 376
var throwIfSelectorIsNotId = function (selector, methodName) {                                                        // 377
  if (!LocalCollection._selectorIsIdPerhapsAsObject(selector)) {                                                      // 378
    throw new Meteor.Error(                                                                                           // 379
      403, "Not permitted. Untrusted code may only " + methodName +                                                   // 380
        " documents by ID.");                                                                                         // 381
  }                                                                                                                   // 382
};                                                                                                                    // 383
                                                                                                                      // 384
// 'insert' immediately returns the inserted document's new _id.                                                      // 385
// The others return values immediately if you are in a stub, an in-memory                                            // 386
// unmanaged collection, or a mongo-backed collection and you don't pass a                                            // 387
// callback. 'update' and 'remove' return the number of affected                                                      // 388
// documents. 'upsert' returns an object with keys 'numberAffected' and, if an                                        // 389
// insert happened, 'insertedId'.                                                                                     // 390
//                                                                                                                    // 391
// Otherwise, the semantics are exactly like other methods: they take                                                 // 392
// a callback as an optional last argument; if no callback is                                                         // 393
// provided, they block until the operation is complete, and throw an                                                 // 394
// exception if it fails; if a callback is provided, then they don't                                                  // 395
// necessarily block, and they call the callback when they finish with error and                                      // 396
// result arguments.  (The insert method provides the document ID as its result;                                      // 397
// update and remove provide the number of affected docs as the result; upsert                                        // 398
// provides an object with numberAffected and maybe insertedId.)                                                      // 399
//                                                                                                                    // 400
// On the client, blocking is impossible, so if a callback                                                            // 401
// isn't provided, they just return immediately and any error                                                         // 402
// information is lost.                                                                                               // 403
//                                                                                                                    // 404
// There's one more tweak. On the client, if you don't provide a                                                      // 405
// callback, then if there is an error, a message will be logged with                                                 // 406
// Meteor._debug.                                                                                                     // 407
//                                                                                                                    // 408
// The intent (though this is actually determined by the underlying                                                   // 409
// drivers) is that the operations should be done synchronously, not                                                  // 410
// generating their result until the database has acknowledged                                                        // 411
// them. In the future maybe we should provide a flag to turn this                                                    // 412
// off.                                                                                                               // 413
                                                                                                                      // 414
/**                                                                                                                   // 415
 * @summary Insert a document in the collection.  Returns its unique _id.                                             // 416
 * @locus Anywhere                                                                                                    // 417
 * @method  insert                                                                                                    // 418
 * @memberOf Mongo.Collection                                                                                         // 419
 * @instance                                                                                                          // 420
 * @param {Object} doc The document to insert. May not yet have an _id attribute, in which case Meteor will generate one for you.
 * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the _id as the second.
 */                                                                                                                   // 423
                                                                                                                      // 424
/**                                                                                                                   // 425
 * @summary Modify one or more documents in the collection. Returns the number of affected documents.                 // 426
 * @locus Anywhere                                                                                                    // 427
 * @method update                                                                                                     // 428
 * @memberOf Mongo.Collection                                                                                         // 429
 * @instance                                                                                                          // 430
 * @param {MongoSelector} selector Specifies which documents to modify                                                // 431
 * @param {MongoModifier} modifier Specifies how to modify the documents                                              // 432
 * @param {Object} [options]                                                                                          // 433
 * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
 * @param {Boolean} options.upsert True to insert a document if no matching documents are found.                      // 435
 * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
 */                                                                                                                   // 437
                                                                                                                      // 438
/**                                                                                                                   // 439
 * @summary Remove documents from the collection                                                                      // 440
 * @locus Anywhere                                                                                                    // 441
 * @method remove                                                                                                     // 442
 * @memberOf Mongo.Collection                                                                                         // 443
 * @instance                                                                                                          // 444
 * @param {MongoSelector} selector Specifies which documents to remove                                                // 445
 * @param {Function} [callback] Optional.  If present, called with an error object as its argument.                   // 446
 */                                                                                                                   // 447
                                                                                                                      // 448
_.each(["insert", "update", "remove"], function (name) {                                                              // 449
  Mongo.Collection.prototype[name] = function (/* arguments */) {                                                     // 450
    var self = this;                                                                                                  // 451
    var args = _.toArray(arguments);                                                                                  // 452
    var callback;                                                                                                     // 453
    var insertId;                                                                                                     // 454
    var ret;                                                                                                          // 455
                                                                                                                      // 456
    // Pull off any callback (or perhaps a 'callback' variable that was passed                                        // 457
    // in undefined, like how 'upsert' does it).                                                                      // 458
    if (args.length &&                                                                                                // 459
        (args[args.length - 1] === undefined ||                                                                       // 460
         args[args.length - 1] instanceof Function)) {                                                                // 461
      callback = args.pop();                                                                                          // 462
    }                                                                                                                 // 463
                                                                                                                      // 464
    if (name === "insert") {                                                                                          // 465
      if (!args.length)                                                                                               // 466
        throw new Error("insert requires an argument");                                                               // 467
      // shallow-copy the document and generate an ID                                                                 // 468
      args[0] = _.extend({}, args[0]);                                                                                // 469
      if ('_id' in args[0]) {                                                                                         // 470
        insertId = args[0]._id;                                                                                       // 471
        if (!insertId || !(typeof insertId === 'string'                                                               // 472
              || insertId instanceof Mongo.ObjectID))                                                                 // 473
          throw new Error("Meteor requires document _id fields to be non-empty strings or ObjectIDs");                // 474
      } else {                                                                                                        // 475
        var generateId = true;                                                                                        // 476
        // Don't generate the id if we're the client and the 'outermost' call                                         // 477
        // This optimization saves us passing both the randomSeed and the id                                          // 478
        // Passing both is redundant.                                                                                 // 479
        if (self._connection && self._connection !== Meteor.server) {                                                 // 480
          var enclosing = DDP._CurrentInvocation.get();                                                               // 481
          if (!enclosing) {                                                                                           // 482
            generateId = false;                                                                                       // 483
          }                                                                                                           // 484
        }                                                                                                             // 485
        if (generateId) {                                                                                             // 486
          insertId = args[0]._id = self._makeNewID();                                                                 // 487
        }                                                                                                             // 488
      }                                                                                                               // 489
    } else {                                                                                                          // 490
      args[0] = Mongo.Collection._rewriteSelector(args[0]);                                                           // 491
                                                                                                                      // 492
      if (name === "update") {                                                                                        // 493
        // Mutate args but copy the original options object. We need to add                                           // 494
        // insertedId to options, but don't want to mutate the caller's options                                       // 495
        // object. We need to mutate `args` because we pass `args` into the                                           // 496
        // driver below.                                                                                              // 497
        var options = args[2] = _.clone(args[2]) || {};                                                               // 498
        if (options && typeof options !== "function" && options.upsert) {                                             // 499
          // set `insertedId` if absent.  `insertedId` is a Meteor extension.                                         // 500
          if (options.insertedId) {                                                                                   // 501
            if (!(typeof options.insertedId === 'string'                                                              // 502
                  || options.insertedId instanceof Mongo.ObjectID))                                                   // 503
              throw new Error("insertedId must be string or ObjectID");                                               // 504
          } else if (! args[0]._id) {                                                                                 // 505
            options.insertedId = self._makeNewID();                                                                   // 506
          }                                                                                                           // 507
        }                                                                                                             // 508
      }                                                                                                               // 509
    }                                                                                                                 // 510
                                                                                                                      // 511
    // On inserts, always return the id that we generated; on all other                                               // 512
    // operations, just return the result from the collection.                                                        // 513
    var chooseReturnValueFromCollectionResult = function (result) {                                                   // 514
      if (name === "insert") {                                                                                        // 515
        if (!insertId && result) {                                                                                    // 516
          insertId = result;                                                                                          // 517
        }                                                                                                             // 518
        return insertId;                                                                                              // 519
      } else {                                                                                                        // 520
        return result;                                                                                                // 521
      }                                                                                                               // 522
    };                                                                                                                // 523
                                                                                                                      // 524
    var wrappedCallback;                                                                                              // 525
    if (callback) {                                                                                                   // 526
      wrappedCallback = function (error, result) {                                                                    // 527
        callback(error, ! error && chooseReturnValueFromCollectionResult(result));                                    // 528
      };                                                                                                              // 529
    }                                                                                                                 // 530
                                                                                                                      // 531
    // XXX see #MeteorServerNull                                                                                      // 532
    if (self._connection && self._connection !== Meteor.server) {                                                     // 533
      // just remote to another endpoint, propagate return value or                                                   // 534
      // exception.                                                                                                   // 535
                                                                                                                      // 536
      var enclosing = DDP._CurrentInvocation.get();                                                                   // 537
      var alreadyInSimulation = enclosing && enclosing.isSimulation;                                                  // 538
                                                                                                                      // 539
      if (Meteor.isClient && !wrappedCallback && ! alreadyInSimulation) {                                             // 540
        // Client can't block, so it can't report errors by exception,                                                // 541
        // only by callback. If they forget the callback, give them a                                                 // 542
        // default one that logs the error, so they aren't totally                                                    // 543
        // baffled if their writes don't work because their database is                                               // 544
        // down.                                                                                                      // 545
        // Don't give a default callback in simulation, because inside stubs we                                       // 546
        // want to return the results from the local collection immediately and                                       // 547
        // not force a callback.                                                                                      // 548
        wrappedCallback = function (err) {                                                                            // 549
          if (err)                                                                                                    // 550
            Meteor._debug(name + " failed: " + (err.reason || err.stack));                                            // 551
        };                                                                                                            // 552
      }                                                                                                               // 553
                                                                                                                      // 554
      if (!alreadyInSimulation && name !== "insert") {                                                                // 555
        // If we're about to actually send an RPC, we should throw an error if                                        // 556
        // this is a non-ID selector, because the mutation methods only allow                                         // 557
        // single-ID selectors. (If we don't throw here, we'll see flicker.)                                          // 558
        throwIfSelectorIsNotId(args[0], name);                                                                        // 559
      }                                                                                                               // 560
                                                                                                                      // 561
      ret = chooseReturnValueFromCollectionResult(                                                                    // 562
        self._connection.apply(self._prefix + name, args, {returnStubValue: true}, wrappedCallback)                   // 563
      );                                                                                                              // 564
                                                                                                                      // 565
    } else {                                                                                                          // 566
      // it's my collection.  descend into the collection object                                                      // 567
      // and propagate any exception.                                                                                 // 568
      args.push(wrappedCallback);                                                                                     // 569
      try {                                                                                                           // 570
        // If the user provided a callback and the collection implements this                                         // 571
        // operation asynchronously, then queryRet will be undefined, and the                                         // 572
        // result will be returned through the callback instead.                                                      // 573
        var queryRet = self._collection[name].apply(self._collection, args);                                          // 574
        ret = chooseReturnValueFromCollectionResult(queryRet);                                                        // 575
      } catch (e) {                                                                                                   // 576
        if (callback) {                                                                                               // 577
          callback(e);                                                                                                // 578
          return null;                                                                                                // 579
        }                                                                                                             // 580
        throw e;                                                                                                      // 581
      }                                                                                                               // 582
    }                                                                                                                 // 583
                                                                                                                      // 584
    // both sync and async, unless we threw an exception, return ret                                                  // 585
    // (new document ID for insert, num affected for update/remove, object with                                       // 586
    // numberAffected and maybe insertedId for upsert).                                                               // 587
    return ret;                                                                                                       // 588
  };                                                                                                                  // 589
});                                                                                                                   // 590
                                                                                                                      // 591
/**                                                                                                                   // 592
 * @summary Modify one or more documents in the collection, or insert one if no matching documents were found. Returns an object with keys `numberAffected` (the number of documents modified)  and `insertedId` (the unique _id of the document that was inserted, if any).
 * @locus Anywhere                                                                                                    // 594
 * @param {MongoSelector} selector Specifies which documents to modify                                                // 595
 * @param {MongoModifier} modifier Specifies how to modify the documents                                              // 596
 * @param {Object} [options]                                                                                          // 597
 * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
 * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
 */                                                                                                                   // 600
Mongo.Collection.prototype.upsert = function (selector, modifier,                                                     // 601
                                               options, callback) {                                                   // 602
  var self = this;                                                                                                    // 603
  if (! callback && typeof options === "function") {                                                                  // 604
    callback = options;                                                                                               // 605
    options = {};                                                                                                     // 606
  }                                                                                                                   // 607
  return self.update(selector, modifier,                                                                              // 608
              _.extend({}, options, { _returnObject: true, upsert: true }),                                           // 609
              callback);                                                                                              // 610
};                                                                                                                    // 611
                                                                                                                      // 612
// We'll actually design an index API later. For now, we just pass through to                                         // 613
// Mongo's, but make it synchronous.                                                                                  // 614
Mongo.Collection.prototype._ensureIndex = function (index, options) {                                                 // 615
  var self = this;                                                                                                    // 616
  if (!self._collection._ensureIndex)                                                                                 // 617
    throw new Error("Can only call _ensureIndex on server collections");                                              // 618
  self._collection._ensureIndex(index, options);                                                                      // 619
};                                                                                                                    // 620
Mongo.Collection.prototype._dropIndex = function (index) {                                                            // 621
  var self = this;                                                                                                    // 622
  if (!self._collection._dropIndex)                                                                                   // 623
    throw new Error("Can only call _dropIndex on server collections");                                                // 624
  self._collection._dropIndex(index);                                                                                 // 625
};                                                                                                                    // 626
Mongo.Collection.prototype._dropCollection = function () {                                                            // 627
  var self = this;                                                                                                    // 628
  if (!self._collection.dropCollection)                                                                               // 629
    throw new Error("Can only call _dropCollection on server collections");                                           // 630
  self._collection.dropCollection();                                                                                  // 631
};                                                                                                                    // 632
Mongo.Collection.prototype._createCappedCollection = function (byteSize, maxDocuments) {                              // 633
  var self = this;                                                                                                    // 634
  if (!self._collection._createCappedCollection)                                                                      // 635
    throw new Error("Can only call _createCappedCollection on server collections");                                   // 636
  self._collection._createCappedCollection(byteSize, maxDocuments);                                                   // 637
};                                                                                                                    // 638
                                                                                                                      // 639
/**                                                                                                                   // 640
 * @summary Create a Mongo-style `ObjectID`.  If you don't specify a `hexString`, the `ObjectID` will generated randomly (not using MongoDB's ID construction rules).
 * @locus Anywhere                                                                                                    // 642
 * @class                                                                                                             // 643
 * @param {String} hexString Optional.  The 24-character hexadecimal contents of the ObjectID to create               // 644
 */                                                                                                                   // 645
Mongo.ObjectID = LocalCollection._ObjectID;                                                                           // 646
                                                                                                                      // 647
/**                                                                                                                   // 648
 * @summary To create a cursor, use find. To access the documents in a cursor, use forEach, map, or fetch.            // 649
 * @class                                                                                                             // 650
 * @instanceName cursor                                                                                               // 651
 */                                                                                                                   // 652
Mongo.Cursor = LocalCollection.Cursor;                                                                                // 653
                                                                                                                      // 654
/**                                                                                                                   // 655
 * @deprecated in 0.9.1                                                                                               // 656
 */                                                                                                                   // 657
Mongo.Collection.Cursor = Mongo.Cursor;                                                                               // 658
                                                                                                                      // 659
/**                                                                                                                   // 660
 * @deprecated in 0.9.1                                                                                               // 661
 */                                                                                                                   // 662
Mongo.Collection.ObjectID = Mongo.ObjectID;                                                                           // 663
                                                                                                                      // 664
///                                                                                                                   // 665
/// Remote methods and access control.                                                                                // 666
///                                                                                                                   // 667
                                                                                                                      // 668
// Restrict default mutators on collection. allow() and deny() take the                                               // 669
// same options:                                                                                                      // 670
//                                                                                                                    // 671
// options.insert {Function(userId, doc)}                                                                             // 672
//   return true to allow/deny adding this document                                                                   // 673
//                                                                                                                    // 674
// options.update {Function(userId, docs, fields, modifier)}                                                          // 675
//   return true to allow/deny updating these documents.                                                              // 676
//   `fields` is passed as an array of fields that are to be modified                                                 // 677
//                                                                                                                    // 678
// options.remove {Function(userId, docs)}                                                                            // 679
//   return true to allow/deny removing these documents                                                               // 680
//                                                                                                                    // 681
// options.fetch {Array}                                                                                              // 682
//   Fields to fetch for these validators. If any call to allow or deny                                               // 683
//   does not have this option then all fields are loaded.                                                            // 684
//                                                                                                                    // 685
// allow and deny can be called multiple times. The validators are                                                    // 686
// evaluated as follows:                                                                                              // 687
// - If neither deny() nor allow() has been called on the collection,                                                 // 688
//   then the request is allowed if and only if the "insecure" smart                                                  // 689
//   package is in use.                                                                                               // 690
// - Otherwise, if any deny() function returns true, the request is denied.                                           // 691
// - Otherwise, if any allow() function returns true, the request is allowed.                                         // 692
// - Otherwise, the request is denied.                                                                                // 693
//                                                                                                                    // 694
// Meteor may call your deny() and allow() functions in any order, and may not                                        // 695
// call all of them if it is able to make a decision without calling them all                                         // 696
// (so don't include side effects).                                                                                   // 697
                                                                                                                      // 698
(function () {                                                                                                        // 699
  var addValidator = function(allowOrDeny, options) {                                                                 // 700
    // validate keys                                                                                                  // 701
    var VALID_KEYS = ['insert', 'update', 'remove', 'fetch', 'transform'];                                            // 702
    _.each(_.keys(options), function (key) {                                                                          // 703
      if (!_.contains(VALID_KEYS, key))                                                                               // 704
        throw new Error(allowOrDeny + ": Invalid key: " + key);                                                       // 705
    });                                                                                                               // 706
                                                                                                                      // 707
    var self = this;                                                                                                  // 708
    self._restricted = true;                                                                                          // 709
                                                                                                                      // 710
    _.each(['insert', 'update', 'remove'], function (name) {                                                          // 711
      if (options[name]) {                                                                                            // 712
        if (!(options[name] instanceof Function)) {                                                                   // 713
          throw new Error(allowOrDeny + ": Value for `" + name + "` must be a function");                             // 714
        }                                                                                                             // 715
                                                                                                                      // 716
        // If the transform is specified at all (including as 'null') in this                                         // 717
        // call, then take that; otherwise, take the transform from the                                               // 718
        // collection.                                                                                                // 719
        if (options.transform === undefined) {                                                                        // 720
          options[name].transform = self._transform;  // already wrapped                                              // 721
        } else {                                                                                                      // 722
          options[name].transform = LocalCollection.wrapTransform(                                                    // 723
            options.transform);                                                                                       // 724
        }                                                                                                             // 725
                                                                                                                      // 726
        self._validators[name][allowOrDeny].push(options[name]);                                                      // 727
      }                                                                                                               // 728
    });                                                                                                               // 729
                                                                                                                      // 730
    // Only update the fetch fields if we're passed things that affect                                                // 731
    // fetching. This way allow({}) and allow({insert: f}) don't result in                                            // 732
    // setting fetchAllFields                                                                                         // 733
    if (options.update || options.remove || options.fetch) {                                                          // 734
      if (options.fetch && !(options.fetch instanceof Array)) {                                                       // 735
        throw new Error(allowOrDeny + ": Value for `fetch` must be an array");                                        // 736
      }                                                                                                               // 737
      self._updateFetch(options.fetch);                                                                               // 738
    }                                                                                                                 // 739
  };                                                                                                                  // 740
                                                                                                                      // 741
  /**                                                                                                                 // 742
   * @summary Allow users to write directly to this collection from client code, subject to limitations you define.   // 743
   * @locus Server                                                                                                    // 744
   * @param {Object} options                                                                                          // 745
   * @param {Function} options.insert,update,remove Functions that look at a proposed modification to the database and return true if it should be allowed.
   * @param {String[]} options.fetch Optional performance enhancement. Limits the fields that will be fetched from the database for inspection by your `update` and `remove` functions.
   * @param {Function} options.transform Overrides `transform` on the  [`Collection`](#collections).  Pass `null` to disable transformation.
   */                                                                                                                 // 749
  Mongo.Collection.prototype.allow = function(options) {                                                              // 750
    addValidator.call(this, 'allow', options);                                                                        // 751
  };                                                                                                                  // 752
                                                                                                                      // 753
  /**                                                                                                                 // 754
   * @summary Override `allow` rules.                                                                                 // 755
   * @locus Server                                                                                                    // 756
   * @param {Object} options                                                                                          // 757
   * @param {Function} options.insert,update,remove Functions that look at a proposed modification to the database and return true if it should be denied, even if an [allow](#allow) rule says otherwise.
   * @param {String[]} options.fetch Optional performance enhancement. Limits the fields that will be fetched from the database for inspection by your `update` and `remove` functions.
   * @param {Function} options.transform Overrides `transform` on the  [`Collection`](#collections).  Pass `null` to disable transformation.
   */                                                                                                                 // 761
  Mongo.Collection.prototype.deny = function(options) {                                                               // 762
    addValidator.call(this, 'deny', options);                                                                         // 763
  };                                                                                                                  // 764
})();                                                                                                                 // 765
                                                                                                                      // 766
                                                                                                                      // 767
Mongo.Collection.prototype._defineMutationMethods = function() {                                                      // 768
  var self = this;                                                                                                    // 769
                                                                                                                      // 770
  // set to true once we call any allow or deny methods. If true, use                                                 // 771
  // allow/deny semantics. If false, use insecure mode semantics.                                                     // 772
  self._restricted = false;                                                                                           // 773
                                                                                                                      // 774
  // Insecure mode (default to allowing writes). Defaults to 'undefined' which                                        // 775
  // means insecure iff the insecure package is loaded. This property can be                                          // 776
  // overriden by tests or packages wishing to change insecure mode behavior of                                       // 777
  // their collections.                                                                                               // 778
  self._insecure = undefined;                                                                                         // 779
                                                                                                                      // 780
  self._validators = {                                                                                                // 781
    insert: {allow: [], deny: []},                                                                                    // 782
    update: {allow: [], deny: []},                                                                                    // 783
    remove: {allow: [], deny: []},                                                                                    // 784
    upsert: {allow: [], deny: []}, // dummy arrays; can't set these!                                                  // 785
    fetch: [],                                                                                                        // 786
    fetchAllFields: false                                                                                             // 787
  };                                                                                                                  // 788
                                                                                                                      // 789
  if (!self._name)                                                                                                    // 790
    return; // anonymous collection                                                                                   // 791
                                                                                                                      // 792
  // XXX Think about method namespacing. Maybe methods should be                                                      // 793
  // "Meteor:Mongo:insert/NAME"?                                                                                      // 794
  self._prefix = '/' + self._name + '/';                                                                              // 795
                                                                                                                      // 796
  // mutation methods                                                                                                 // 797
  if (self._connection) {                                                                                             // 798
    var m = {};                                                                                                       // 799
                                                                                                                      // 800
    _.each(['insert', 'update', 'remove'], function (method) {                                                        // 801
      m[self._prefix + method] = function (/* ... */) {                                                               // 802
        // All the methods do their own validation, instead of using check().                                         // 803
        check(arguments, [Match.Any]);                                                                                // 804
        var args = _.toArray(arguments);                                                                              // 805
        try {                                                                                                         // 806
          // For an insert, if the client didn't specify an _id, generate one                                         // 807
          // now; because this uses DDP.randomStream, it will be consistent with                                      // 808
          // what the client generated. We generate it now rather than later so                                       // 809
          // that if (eg) an allow/deny rule does an insert to the same                                               // 810
          // collection (not that it really should), the generated _id will                                           // 811
          // still be the first use of the stream and will be consistent.                                             // 812
          //                                                                                                          // 813
          // However, we don't actually stick the _id onto the document yet,                                          // 814
          // because we want allow/deny rules to be able to differentiate                                             // 815
          // between arbitrary client-specified _id fields and merely                                                 // 816
          // client-controlled-via-randomSeed fields.                                                                 // 817
          var generatedId = null;                                                                                     // 818
          if (method === "insert" && !_.has(args[0], '_id')) {                                                        // 819
            generatedId = self._makeNewID();                                                                          // 820
          }                                                                                                           // 821
                                                                                                                      // 822
          if (this.isSimulation) {                                                                                    // 823
            // In a client simulation, you can do any mutation (even with a                                           // 824
            // complex selector).                                                                                     // 825
            if (generatedId !== null)                                                                                 // 826
              args[0]._id = generatedId;                                                                              // 827
            return self._collection[method].apply(                                                                    // 828
              self._collection, args);                                                                                // 829
          }                                                                                                           // 830
                                                                                                                      // 831
          // This is the server receiving a method call from the client.                                              // 832
                                                                                                                      // 833
          // We don't allow arbitrary selectors in mutations from the client: only                                    // 834
          // single-ID selectors.                                                                                     // 835
          if (method !== 'insert')                                                                                    // 836
            throwIfSelectorIsNotId(args[0], method);                                                                  // 837
                                                                                                                      // 838
          if (self._restricted) {                                                                                     // 839
            // short circuit if there is no way it will pass.                                                         // 840
            if (self._validators[method].allow.length === 0) {                                                        // 841
              throw new Meteor.Error(                                                                                 // 842
                403, "Access denied. No allow validators set on restricted " +                                        // 843
                  "collection for method '" + method + "'.");                                                         // 844
            }                                                                                                         // 845
                                                                                                                      // 846
            var validatedMethodName =                                                                                 // 847
                  '_validated' + method.charAt(0).toUpperCase() + method.slice(1);                                    // 848
            args.unshift(this.userId);                                                                                // 849
            method === 'insert' && args.push(generatedId);                                                            // 850
            return self[validatedMethodName].apply(self, args);                                                       // 851
          } else if (self._isInsecure()) {                                                                            // 852
            if (generatedId !== null)                                                                                 // 853
              args[0]._id = generatedId;                                                                              // 854
            // In insecure mode, allow any mutation (with a simple selector).                                         // 855
            // XXX This is kind of bogus.  Instead of blindly passing whatever                                        // 856
            //     we get from the network to this function, we should actually                                       // 857
            //     know the correct arguments for the function and pass just                                          // 858
            //     them.  For example, if you have an extraneous extra null                                           // 859
            //     argument and this is Mongo on the server, the .wrapAsync'd                                         // 860
            //     functions like update will get confused and pass the                                               // 861
            //     "fut.resolver()" in the wrong slot, where _update will never                                       // 862
            //     invoke it. Bam, broken DDP connection.  Probably should just                                       // 863
            //     take this whole method and write it three times, invoking                                          // 864
            //     helpers for the common code.                                                                       // 865
            return self._collection[method].apply(self._collection, args);                                            // 866
          } else {                                                                                                    // 867
            // In secure mode, if we haven't called allow or deny, then nothing                                       // 868
            // is permitted.                                                                                          // 869
            throw new Meteor.Error(403, "Access denied");                                                             // 870
          }                                                                                                           // 871
        } catch (e) {                                                                                                 // 872
          if (e.name === 'MongoError' || e.name === 'MinimongoError') {                                               // 873
            throw new Meteor.Error(409, e.toString());                                                                // 874
          } else {                                                                                                    // 875
            throw e;                                                                                                  // 876
          }                                                                                                           // 877
        }                                                                                                             // 878
      };                                                                                                              // 879
    });                                                                                                               // 880
    // Minimongo on the server gets no stubs; instead, by default                                                     // 881
    // it wait()s until its result is ready, yielding.                                                                // 882
    // This matches the behavior of macromongo on the server better.                                                  // 883
    // XXX see #MeteorServerNull                                                                                      // 884
    if (Meteor.isClient || self._connection === Meteor.server)                                                        // 885
      self._connection.methods(m);                                                                                    // 886
  }                                                                                                                   // 887
};                                                                                                                    // 888
                                                                                                                      // 889
                                                                                                                      // 890
Mongo.Collection.prototype._updateFetch = function (fields) {                                                         // 891
  var self = this;                                                                                                    // 892
                                                                                                                      // 893
  if (!self._validators.fetchAllFields) {                                                                             // 894
    if (fields) {                                                                                                     // 895
      self._validators.fetch = _.union(self._validators.fetch, fields);                                               // 896
    } else {                                                                                                          // 897
      self._validators.fetchAllFields = true;                                                                         // 898
      // clear fetch just to make sure we don't accidentally read it                                                  // 899
      self._validators.fetch = null;                                                                                  // 900
    }                                                                                                                 // 901
  }                                                                                                                   // 902
};                                                                                                                    // 903
                                                                                                                      // 904
Mongo.Collection.prototype._isInsecure = function () {                                                                // 905
  var self = this;                                                                                                    // 906
  if (self._insecure === undefined)                                                                                   // 907
    return !!Package.insecure;                                                                                        // 908
  return self._insecure;                                                                                              // 909
};                                                                                                                    // 910
                                                                                                                      // 911
var docToValidate = function (validator, doc, generatedId) {                                                          // 912
  var ret = doc;                                                                                                      // 913
  if (validator.transform) {                                                                                          // 914
    ret = EJSON.clone(doc);                                                                                           // 915
    // If you set a server-side transform on your collection, then you don't get                                      // 916
    // to tell the difference between "client specified the ID" and "server                                           // 917
    // generated the ID", because transforms expect to get _id.  If you want to                                       // 918
    // do that check, you can do it with a specific                                                                   // 919
    // `C.allow({insert: f, transform: null})` validator.                                                             // 920
    if (generatedId !== null) {                                                                                       // 921
      ret._id = generatedId;                                                                                          // 922
    }                                                                                                                 // 923
    ret = validator.transform(ret);                                                                                   // 924
  }                                                                                                                   // 925
  return ret;                                                                                                         // 926
};                                                                                                                    // 927
                                                                                                                      // 928
Mongo.Collection.prototype._validatedInsert = function (userId, doc,                                                  // 929
                                                         generatedId) {                                               // 930
  var self = this;                                                                                                    // 931
                                                                                                                      // 932
  // call user validators.                                                                                            // 933
  // Any deny returns true means denied.                                                                              // 934
  if (_.any(self._validators.insert.deny, function(validator) {                                                       // 935
    return validator(userId, docToValidate(validator, doc, generatedId));                                             // 936
  })) {                                                                                                               // 937
    throw new Meteor.Error(403, "Access denied");                                                                     // 938
  }                                                                                                                   // 939
  // Any allow returns true means proceed. Throw error if they all fail.                                              // 940
  if (_.all(self._validators.insert.allow, function(validator) {                                                      // 941
    return !validator(userId, docToValidate(validator, doc, generatedId));                                            // 942
  })) {                                                                                                               // 943
    throw new Meteor.Error(403, "Access denied");                                                                     // 944
  }                                                                                                                   // 945
                                                                                                                      // 946
  // If we generated an ID above, insert it now: after the validation, but                                            // 947
  // before actually inserting.                                                                                       // 948
  if (generatedId !== null)                                                                                           // 949
    doc._id = generatedId;                                                                                            // 950
                                                                                                                      // 951
  self._collection.insert.call(self._collection, doc);                                                                // 952
};                                                                                                                    // 953
                                                                                                                      // 954
var transformDoc = function (validator, doc) {                                                                        // 955
  if (validator.transform)                                                                                            // 956
    return validator.transform(doc);                                                                                  // 957
  return doc;                                                                                                         // 958
};                                                                                                                    // 959
                                                                                                                      // 960
// Simulate a mongo `update` operation while validating that the access                                               // 961
// control rules set by calls to `allow/deny` are satisfied. If all                                                   // 962
// pass, rewrite the mongo operation to use $in to set the list of                                                    // 963
// document ids to change ##ValidatedChange                                                                           // 964
Mongo.Collection.prototype._validatedUpdate = function(                                                               // 965
    userId, selector, mutator, options) {                                                                             // 966
  var self = this;                                                                                                    // 967
                                                                                                                      // 968
  check(mutator, Object);                                                                                             // 969
                                                                                                                      // 970
  options = _.clone(options) || {};                                                                                   // 971
                                                                                                                      // 972
  if (!LocalCollection._selectorIsIdPerhapsAsObject(selector))                                                        // 973
    throw new Error("validated update should be of a single ID");                                                     // 974
                                                                                                                      // 975
  // We don't support upserts because they don't fit nicely into allow/deny                                           // 976
  // rules.                                                                                                           // 977
  if (options.upsert)                                                                                                 // 978
    throw new Meteor.Error(403, "Access denied. Upserts not " +                                                       // 979
                           "allowed in a restricted collection.");                                                    // 980
                                                                                                                      // 981
  var noReplaceError = "Access denied. In a restricted collection you can only" +                                     // 982
        " update documents, not replace them. Use a Mongo update operator, such " +                                   // 983
        "as '$set'.";                                                                                                 // 984
                                                                                                                      // 985
  // compute modified fields                                                                                          // 986
  var fields = [];                                                                                                    // 987
  if (_.isEmpty(mutator)) {                                                                                           // 988
    throw new Meteor.Error(403, noReplaceError);                                                                      // 989
  }                                                                                                                   // 990
  _.each(mutator, function (params, op) {                                                                             // 991
    if (op.charAt(0) !== '$') {                                                                                       // 992
      throw new Meteor.Error(403, noReplaceError);                                                                    // 993
    } else if (!_.has(ALLOWED_UPDATE_OPERATIONS, op)) {                                                               // 994
      throw new Meteor.Error(                                                                                         // 995
        403, "Access denied. Operator " + op + " not allowed in a restricted collection.");                           // 996
    } else {                                                                                                          // 997
      _.each(_.keys(params), function (field) {                                                                       // 998
        // treat dotted fields as if they are replacing their                                                         // 999
        // top-level part                                                                                             // 1000
        if (field.indexOf('.') !== -1)                                                                                // 1001
          field = field.substring(0, field.indexOf('.'));                                                             // 1002
                                                                                                                      // 1003
        // record the field we are trying to change                                                                   // 1004
        if (!_.contains(fields, field))                                                                               // 1005
          fields.push(field);                                                                                         // 1006
      });                                                                                                             // 1007
    }                                                                                                                 // 1008
  });                                                                                                                 // 1009
                                                                                                                      // 1010
  var findOptions = {transform: null};                                                                                // 1011
  if (!self._validators.fetchAllFields) {                                                                             // 1012
    findOptions.fields = {};                                                                                          // 1013
    _.each(self._validators.fetch, function(fieldName) {                                                              // 1014
      findOptions.fields[fieldName] = 1;                                                                              // 1015
    });                                                                                                               // 1016
  }                                                                                                                   // 1017
                                                                                                                      // 1018
  var doc = self._collection.findOne(selector, findOptions);                                                          // 1019
  if (!doc)  // none satisfied!                                                                                       // 1020
    return 0;                                                                                                         // 1021
                                                                                                                      // 1022
  // call user validators.                                                                                            // 1023
  // Any deny returns true means denied.                                                                              // 1024
  if (_.any(self._validators.update.deny, function(validator) {                                                       // 1025
    var factoriedDoc = transformDoc(validator, doc);                                                                  // 1026
    return validator(userId,                                                                                          // 1027
                     factoriedDoc,                                                                                    // 1028
                     fields,                                                                                          // 1029
                     mutator);                                                                                        // 1030
  })) {                                                                                                               // 1031
    throw new Meteor.Error(403, "Access denied");                                                                     // 1032
  }                                                                                                                   // 1033
  // Any allow returns true means proceed. Throw error if they all fail.                                              // 1034
  if (_.all(self._validators.update.allow, function(validator) {                                                      // 1035
    var factoriedDoc = transformDoc(validator, doc);                                                                  // 1036
    return !validator(userId,                                                                                         // 1037
                      factoriedDoc,                                                                                   // 1038
                      fields,                                                                                         // 1039
                      mutator);                                                                                       // 1040
  })) {                                                                                                               // 1041
    throw new Meteor.Error(403, "Access denied");                                                                     // 1042
  }                                                                                                                   // 1043
                                                                                                                      // 1044
  options._forbidReplace = true;                                                                                      // 1045
                                                                                                                      // 1046
  // Back when we supported arbitrary client-provided selectors, we actually                                          // 1047
  // rewrote the selector to include an _id clause before passing to Mongo to                                         // 1048
  // avoid races, but since selector is guaranteed to already just be an ID, we                                       // 1049
  // don't have to any more.                                                                                          // 1050
                                                                                                                      // 1051
  return self._collection.update.call(                                                                                // 1052
    self._collection, selector, mutator, options);                                                                    // 1053
};                                                                                                                    // 1054
                                                                                                                      // 1055
// Only allow these operations in validated updates. Specifically                                                     // 1056
// whitelist operations, rather than blacklist, so new complex                                                        // 1057
// operations that are added aren't automatically allowed. A complex                                                  // 1058
// operation is one that does more than just modify its target                                                        // 1059
// field. For now this contains all update operations except '$rename'.                                               // 1060
// http://docs.mongodb.org/manual/reference/operators/#update                                                         // 1061
var ALLOWED_UPDATE_OPERATIONS = {                                                                                     // 1062
  $inc:1, $set:1, $unset:1, $addToSet:1, $pop:1, $pullAll:1, $pull:1,                                                 // 1063
  $pushAll:1, $push:1, $bit:1                                                                                         // 1064
};                                                                                                                    // 1065
                                                                                                                      // 1066
// Simulate a mongo `remove` operation while validating access control                                                // 1067
// rules. See #ValidatedChange                                                                                        // 1068
Mongo.Collection.prototype._validatedRemove = function(userId, selector) {                                            // 1069
  var self = this;                                                                                                    // 1070
                                                                                                                      // 1071
  var findOptions = {transform: null};                                                                                // 1072
  if (!self._validators.fetchAllFields) {                                                                             // 1073
    findOptions.fields = {};                                                                                          // 1074
    _.each(self._validators.fetch, function(fieldName) {                                                              // 1075
      findOptions.fields[fieldName] = 1;                                                                              // 1076
    });                                                                                                               // 1077
  }                                                                                                                   // 1078
                                                                                                                      // 1079
  var doc = self._collection.findOne(selector, findOptions);                                                          // 1080
  if (!doc)                                                                                                           // 1081
    return 0;                                                                                                         // 1082
                                                                                                                      // 1083
  // call user validators.                                                                                            // 1084
  // Any deny returns true means denied.                                                                              // 1085
  if (_.any(self._validators.remove.deny, function(validator) {                                                       // 1086
    return validator(userId, transformDoc(validator, doc));                                                           // 1087
  })) {                                                                                                               // 1088
    throw new Meteor.Error(403, "Access denied");                                                                     // 1089
  }                                                                                                                   // 1090
  // Any allow returns true means proceed. Throw error if they all fail.                                              // 1091
  if (_.all(self._validators.remove.allow, function(validator) {                                                      // 1092
    return !validator(userId, transformDoc(validator, doc));                                                          // 1093
  })) {                                                                                                               // 1094
    throw new Meteor.Error(403, "Access denied");                                                                     // 1095
  }                                                                                                                   // 1096
                                                                                                                      // 1097
  // Back when we supported arbitrary client-provided selectors, we actually                                          // 1098
  // rewrote the selector to {_id: {$in: [ids that we found]}} before passing to                                      // 1099
  // Mongo to avoid races, but since selector is guaranteed to already just be                                        // 1100
  // an ID, we don't have to any more.                                                                                // 1101
                                                                                                                      // 1102
  return self._collection.remove.call(self._collection, selector);                                                    // 1103
};                                                                                                                    // 1104
                                                                                                                      // 1105
/**                                                                                                                   // 1106
 * @deprecated in 0.9.1                                                                                               // 1107
 */                                                                                                                   // 1108
Meteor.Collection = Mongo.Collection;                                                                                 // 1109
                                                                                                                      // 1110
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
