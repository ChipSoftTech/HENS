(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                 //
// packages/tinytest/tinytest.js                                                                   //
//                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                   //
var Future;                                                                                        // 1
if (Meteor.isServer)                                                                               // 2
  Future = Npm.require('fibers/future');                                                           // 3
                                                                                                   // 4
/******************************************************************************/                   // 5
/* TestCaseResults                                                            */                   // 6
/******************************************************************************/                   // 7
                                                                                                   // 8
TestCaseResults = function (test_case, onEvent, onException, stop_at_offset) {                     // 9
  var self = this;                                                                                 // 10
  self.test_case = test_case;                                                                      // 11
  self.onEvent = onEvent;                                                                          // 12
  self.expecting_failure = false;                                                                  // 13
  self.current_fail_count = 0;                                                                     // 14
  self.stop_at_offset = stop_at_offset;                                                            // 15
  self.onException = onException;                                                                  // 16
  self.id = Random.id();                                                                           // 17
  self.extraDetails = {};                                                                          // 18
};                                                                                                 // 19
                                                                                                   // 20
_.extend(TestCaseResults.prototype, {                                                              // 21
  ok: function (doc) {                                                                             // 22
    var self = this;                                                                               // 23
    var ok = {type: "ok"};                                                                         // 24
    if (doc)                                                                                       // 25
      ok.details = doc;                                                                            // 26
    if (self.expecting_failure) {                                                                  // 27
      ok.details = ok.details || {};                                                               // 28
      ok.details["was_expecting_failure"] = true;                                                  // 29
      self.expecting_failure = false;                                                              // 30
    }                                                                                              // 31
    self.onEvent(ok);                                                                              // 32
  },                                                                                               // 33
                                                                                                   // 34
  expect_fail: function () {                                                                       // 35
    var self = this;                                                                               // 36
    self.expecting_failure = true;                                                                 // 37
  },                                                                                               // 38
                                                                                                   // 39
  fail: function (doc) {                                                                           // 40
    var self = this;                                                                               // 41
                                                                                                   // 42
    if (typeof doc === "string") {                                                                 // 43
      // Some very old code still tries to call fail() with a                                      // 44
      // string. Don't do this!                                                                    // 45
      doc = { type: "fail", message: doc };                                                        // 46
    }                                                                                              // 47
                                                                                                   // 48
    doc = _.extend({}, doc, self.extraDetails);                                                    // 49
                                                                                                   // 50
    if (self.stop_at_offset === 0) {                                                               // 51
      if (Meteor.isClient) {                                                                       // 52
        // Only supported on the browser for now..                                                 // 53
        var now = (+new Date);                                                                     // 54
        debugger;                                                                                  // 55
        if ((+new Date) - now < 100)                                                               // 56
          alert("To use this feature, first enable your browser's debugger.");                     // 57
      }                                                                                            // 58
      self.stop_at_offset = null;                                                                  // 59
    }                                                                                              // 60
    if (self.stop_at_offset)                                                                       // 61
      self.stop_at_offset--;                                                                       // 62
                                                                                                   // 63
    // Get filename and line number of failure if we're using v8 (Chrome or                        // 64
    // Node).                                                                                      // 65
    if (Error.captureStackTrace) {                                                                 // 66
      var savedPrepareStackTrace = Error.prepareStackTrace;                                        // 67
      Error.prepareStackTrace = function(_, stack){ return stack; };                               // 68
      var err = new Error;                                                                         // 69
      Error.captureStackTrace(err);                                                                // 70
      var stack = err.stack;                                                                       // 71
      Error.prepareStackTrace = savedPrepareStackTrace;                                            // 72
      for (var i = stack.length - 1; i >= 0; --i) {                                                // 73
        var frame = stack[i];                                                                      // 74
        // Heuristic: use the OUTERMOST line which is in a :tests.js                               // 75
        // file (this is less likely to be a test helper function).                                // 76
        if (frame.getFileName().match(/:tests\.js/)) {                                             // 77
          doc.filename = frame.getFileName();                                                      // 78
          doc.line = frame.getLineNumber();                                                        // 79
          break;                                                                                   // 80
        }                                                                                          // 81
      }                                                                                            // 82
    }                                                                                              // 83
                                                                                                   // 84
    self.onEvent({                                                                                 // 85
        type: (self.expecting_failure ? "expected_fail" : "fail"),                                 // 86
        details: doc,                                                                              // 87
        cookie: {name: self.test_case.name, offset: self.current_fail_count,                       // 88
                 groupPath: self.test_case.groupPath,                                              // 89
                 shortName: self.test_case.shortName}                                              // 90
    });                                                                                            // 91
    self.expecting_failure = false;                                                                // 92
    self.current_fail_count++;                                                                     // 93
  },                                                                                               // 94
                                                                                                   // 95
  // Call this to fail the test with an exception. Use this to record                              // 96
  // exceptions that occur inside asynchronous callbacks in tests.                                 // 97
  //                                                                                               // 98
  // It should only be used with asynchronous tests, and if you call                               // 99
  // this function, you should make sure that (1) the test doesn't                                 // 100
  // call its callback (onComplete function); (2) the test function                                // 101
  // doesn't directly raise an exception.                                                          // 102
  exception: function (exception) {                                                                // 103
    this.onException(exception);                                                                   // 104
  },                                                                                               // 105
                                                                                                   // 106
  // returns a unique ID for this test run, for convenience use by                                 // 107
  // your tests                                                                                    // 108
  runId: function () {                                                                             // 109
    return this.id;                                                                                // 110
  },                                                                                               // 111
                                                                                                   // 112
  // === Following patterned after http://vowsjs.org/#reference ===                                // 113
                                                                                                   // 114
  // XXX eliminate 'message' and 'not' arguments                                                   // 115
  equal: function (actual, expected, message, not) {                                               // 116
                                                                                                   // 117
    if ((! not) && (typeof actual === 'string') &&                                                 // 118
        (typeof expected === 'string')) {                                                          // 119
      this._stringEqual(actual, expected, message);                                                // 120
      return;                                                                                      // 121
    }                                                                                              // 122
                                                                                                   // 123
    /* If expected is a DOM node, do a literal '===' comparison with                               // 124
     * actual. Otherwise do a deep comparison, as implemented by _.isEqual.                        // 125
     */                                                                                            // 126
                                                                                                   // 127
    var matched;                                                                                   // 128
    // XXX remove cruft specific to liverange                                                      // 129
    if (typeof expected === "object" && expected && expected.nodeType) {                           // 130
      matched = expected === actual;                                                               // 131
      expected = "[Node]";                                                                         // 132
      actual = "[Unknown]";                                                                        // 133
    } else if (typeof Uint8Array !== 'undefined' && expected instanceof Uint8Array) {              // 134
      // I have no idea why but _.isEqual on Chrome horks completely on Uint8Arrays.               // 135
      // and the symptom is the chrome renderer taking up an entire CPU and freezing               // 136
      // your web page, but not pausing anywhere in _.isEqual.  I don't understand it              // 137
      // but we fall back to a manual comparison                                                   // 138
      if (!(actual instanceof Uint8Array))                                                         // 139
        this.fail({type: "assert_equal", message: "found object is not a typed array",             // 140
                   expected: "A typed array", actual: actual.constructor.toString()});             // 141
      if (expected.length !== actual.length)                                                       // 142
        this.fail({type: "assert_equal", message: "lengths of typed arrays do not match",          // 143
                   expected: expected.length, actual: actual.length});                             // 144
      for (var i = 0; i < expected.length; i++) {                                                  // 145
        this.equal(actual[i], expected[i]);                                                        // 146
      }                                                                                            // 147
    } else {                                                                                       // 148
      matched = EJSON.equals(expected, actual);                                                    // 149
    }                                                                                              // 150
                                                                                                   // 151
    if (matched === !!not) {                                                                       // 152
      this.fail({type: "assert_equal", message: message,                                           // 153
                 expected: JSON.stringify(expected), actual: JSON.stringify(actual), not: !!not}); // 154
    } else                                                                                         // 155
      this.ok();                                                                                   // 156
  },                                                                                               // 157
                                                                                                   // 158
  notEqual: function (actual, expected, message) {                                                 // 159
    this.equal(actual, expected, message, true);                                                   // 160
  },                                                                                               // 161
                                                                                                   // 162
  instanceOf: function (obj, klass, message) {                                                     // 163
    if (obj instanceof klass)                                                                      // 164
      this.ok();                                                                                   // 165
    else                                                                                           // 166
      this.fail({type: "instanceOf", message: message, not: false}); // XXX what other data?       // 167
  },                                                                                               // 168
                                                                                                   // 169
  notInstanceOf: function (obj, klass, message) {                                                  // 170
    if (obj instanceof klass)                                                                      // 171
      this.fail({type: "instanceOf", message: message, not: true}); // XXX what other data?        // 172
    else                                                                                           // 173
      this.ok();                                                                                   // 174
  },                                                                                               // 175
                                                                                                   // 176
  matches: function (actual, regexp, message) {                                                    // 177
    if (regexp.test(actual))                                                                       // 178
      this.ok();                                                                                   // 179
    else                                                                                           // 180
      this.fail({type: "matches", message: message,                                                // 181
                 actual: actual, regexp: regexp.toString(), not: false});                          // 182
  },                                                                                               // 183
                                                                                                   // 184
  notMatches: function (actual, regexp, message) {                                                 // 185
    if (regexp.test(actual))                                                                       // 186
      this.fail({type: "matches", message: message,                                                // 187
                 actual: actual, regexp: regexp.toString(), not: true});                           // 188
    else                                                                                           // 189
      this.ok();                                                                                   // 190
  },                                                                                               // 191
                                                                                                   // 192
  // expected can be:                                                                              // 193
  //  undefined: accept any exception.                                                             // 194
  //  string: pass if the string is a substring of the exception message.                          // 195
  //  regexp: pass if the exception message passes the regexp.                                     // 196
  //  function: call the function as a predicate with the exception.                               // 197
  //                                                                                               // 198
  // Note: Node's assert.throws also accepts a constructor to test                                 // 199
  // whether the error is of the expected class.  But since                                        // 200
  // JavaScript can't distinguish between constructors and plain                                   // 201
  // functions and Node's assert.throws also accepts a predicate                                   // 202
  // function, if the error fails the instanceof test with the                                     // 203
  // constructor then the constructor is then treated as a predicate                               // 204
  // and called (!)                                                                                // 205
  //                                                                                               // 206
  // The upshot is, if you want to test whether an error is of a                                   // 207
  // particular class, use a predicate function.                                                   // 208
  //                                                                                               // 209
  throws: function (f, expected) {                                                                 // 210
    var actual, predicate;                                                                         // 211
                                                                                                   // 212
    if (expected === undefined)                                                                    // 213
      predicate = function (actual) {                                                              // 214
        return true;                                                                               // 215
      };                                                                                           // 216
    else if (_.isString(expected))                                                                 // 217
      predicate = function (actual) {                                                              // 218
        return _.isString(actual.message) &&                                                       // 219
               actual.message.indexOf(expected) !== -1;                                            // 220
      };                                                                                           // 221
    else if (expected instanceof RegExp)                                                           // 222
      predicate = function (actual) {                                                              // 223
        return expected.test(actual.message);                                                      // 224
      };                                                                                           // 225
    else if (typeof expected === 'function')                                                       // 226
      predicate = expected;                                                                        // 227
    else                                                                                           // 228
      throw new Error('expected should be a string, regexp, or predicate function');               // 229
                                                                                                   // 230
    try {                                                                                          // 231
      f();                                                                                         // 232
    } catch (exception) {                                                                          // 233
      actual = exception;                                                                          // 234
    }                                                                                              // 235
                                                                                                   // 236
    if (actual && predicate(actual))                                                               // 237
      this.ok();                                                                                   // 238
    else                                                                                           // 239
      this.fail({                                                                                  // 240
        type: "throws",                                                                            // 241
        message: actual ?                                                                          // 242
          "wrong error thrown: " + actual.message :                                                // 243
          "did not throw an error as expected"                                                     // 244
      });                                                                                          // 245
  },                                                                                               // 246
                                                                                                   // 247
  isTrue: function (v, msg) {                                                                      // 248
    if (v)                                                                                         // 249
      this.ok();                                                                                   // 250
    else                                                                                           // 251
      this.fail({type: "true", message: msg, not: false});                                         // 252
  },                                                                                               // 253
                                                                                                   // 254
  isFalse: function (v, msg) {                                                                     // 255
    if (v)                                                                                         // 256
      this.fail({type: "true", message: msg, not: true});                                          // 257
    else                                                                                           // 258
      this.ok();                                                                                   // 259
  },                                                                                               // 260
                                                                                                   // 261
  isNull: function (v, msg) {                                                                      // 262
    if (v === null)                                                                                // 263
      this.ok();                                                                                   // 264
    else                                                                                           // 265
      this.fail({type: "null", message: msg, not: false});                                         // 266
  },                                                                                               // 267
                                                                                                   // 268
  isNotNull: function (v, msg) {                                                                   // 269
    if (v === null)                                                                                // 270
      this.fail({type: "null", message: msg, not: true});                                          // 271
    else                                                                                           // 272
      this.ok();                                                                                   // 273
  },                                                                                               // 274
                                                                                                   // 275
  isUndefined: function (v, msg) {                                                                 // 276
    if (v === undefined)                                                                           // 277
      this.ok();                                                                                   // 278
    else                                                                                           // 279
      this.fail({type: "undefined", message: msg, not: false});                                    // 280
  },                                                                                               // 281
                                                                                                   // 282
  isNotUndefined: function (v, msg) {                                                              // 283
    if (v === undefined)                                                                           // 284
      this.fail({type: "undefined", message: msg, not: true});                                     // 285
    else                                                                                           // 286
      this.ok();                                                                                   // 287
  },                                                                                               // 288
                                                                                                   // 289
  isNaN: function (v, msg) {                                                                       // 290
    if (isNaN(v))                                                                                  // 291
      this.ok();                                                                                   // 292
    else                                                                                           // 293
      this.fail({type: "NaN", message: msg, not: false});                                          // 294
  },                                                                                               // 295
                                                                                                   // 296
  isNotNaN: function (v, msg) {                                                                    // 297
    if (isNaN(v))                                                                                  // 298
      this.fail({type: "NaN", message: msg, not: true});                                           // 299
    else                                                                                           // 300
      this.ok();                                                                                   // 301
  },                                                                                               // 302
                                                                                                   // 303
  include: function (s, v, message, not) {                                                         // 304
    var pass = false;                                                                              // 305
    if (s instanceof Array)                                                                        // 306
      pass = _.any(s, function(it) {return _.isEqual(v, it);});                                    // 307
    else if (typeof s === "object")                                                                // 308
      pass = v in s;                                                                               // 309
    else if (typeof s === "string")                                                                // 310
      if (s.indexOf(v) > -1) {                                                                     // 311
        pass = true;                                                                               // 312
      }                                                                                            // 313
    else                                                                                           // 314
      /* fail -- not something that contains other things */;                                      // 315
    if (pass === ! not)                                                                            // 316
      this.ok();                                                                                   // 317
    else {                                                                                         // 318
      this.fail({type: "include", message: message,                                                // 319
                 sequence: s, should_contain_value: v, not: !!not});                               // 320
    }                                                                                              // 321
  },                                                                                               // 322
                                                                                                   // 323
  notInclude: function (s, v, message) {                                                           // 324
    this.include(s, v, message, true);                                                             // 325
  },                                                                                               // 326
                                                                                                   // 327
  // XXX should change to lengthOf to match vowsjs                                                 // 328
  length: function (obj, expected_length, msg) {                                                   // 329
    if (obj.length === expected_length)                                                            // 330
      this.ok();                                                                                   // 331
    else                                                                                           // 332
      this.fail({type: "length", expected: expected_length,                                        // 333
                 actual: obj.length, message: msg});                                               // 334
  },                                                                                               // 335
                                                                                                   // 336
  // EXPERIMENTAL way to compare two strings that results in                                       // 337
  // a nicer display in the test runner, e.g. for multiline                                        // 338
  // strings                                                                                       // 339
  _stringEqual: function (actual, expected, message) {                                             // 340
    if (actual !== expected) {                                                                     // 341
      this.fail({type: "string_equal",                                                             // 342
                 message: message,                                                                 // 343
                 expected: expected,                                                               // 344
                 actual: actual});                                                                 // 345
    } else {                                                                                       // 346
      this.ok();                                                                                   // 347
    }                                                                                              // 348
  }                                                                                                // 349
                                                                                                   // 350
                                                                                                   // 351
});                                                                                                // 352
                                                                                                   // 353
/******************************************************************************/                   // 354
/* TestCase                                                                   */                   // 355
/******************************************************************************/                   // 356
                                                                                                   // 357
TestCase = function (name, func) {                                                                 // 358
  var self = this;                                                                                 // 359
  self.name = name;                                                                                // 360
  self.func = func;                                                                                // 361
                                                                                                   // 362
  var nameParts = _.map(name.split(" - "), function(s) {                                           // 363
    return s.replace(/^\s*|\s*$/g, ""); // trim                                                    // 364
  });                                                                                              // 365
  self.shortName = nameParts.pop();                                                                // 366
  nameParts.unshift("tinytest");                                                                   // 367
  self.groupPath = nameParts;                                                                      // 368
};                                                                                                 // 369
                                                                                                   // 370
_.extend(TestCase.prototype, {                                                                     // 371
  // Run the test asynchronously, delivering results via onEvent;                                  // 372
  // then call onComplete() on success, or else onException(e) if the                              // 373
  // test raised (or voluntarily reported) an exception.                                           // 374
  run: function (onEvent, onComplete, onException, stop_at_offset) {                               // 375
    var self = this;                                                                               // 376
                                                                                                   // 377
    var completed = false;                                                                         // 378
    var markComplete = function () {                                                               // 379
      if (completed) {                                                                             // 380
        Meteor._debug("*** Test error -- test '" + self.name +                                     // 381
                      "' returned multiple times.");                                               // 382
        return false;                                                                              // 383
      }                                                                                            // 384
      completed = true;                                                                            // 385
      return true;                                                                                 // 386
    };                                                                                             // 387
                                                                                                   // 388
    var wrappedOnEvent = function (e) {                                                            // 389
      // If this trace prints, it means you ran some test.* function after the                     // 390
      // test finished! Another symptom will be that the test will display as                      // 391
      // "waiting" even when it counts as passed or failed.                                        // 392
      if (completed)                                                                               // 393
        console.trace("event after complete!");                                                    // 394
      return onEvent(e);                                                                           // 395
    };                                                                                             // 396
                                                                                                   // 397
    var results = new TestCaseResults(self, wrappedOnEvent,                                        // 398
                                      function (e) {                                               // 399
                                        if (markComplete())                                        // 400
                                          onException(e);                                          // 401
                                      }, stop_at_offset);                                          // 402
                                                                                                   // 403
    Meteor.defer(function () {                                                                     // 404
      try {                                                                                        // 405
        self.func(results, function () {                                                           // 406
          if (markComplete())                                                                      // 407
            onComplete();                                                                          // 408
        });                                                                                        // 409
      } catch (e) {                                                                                // 410
        if (markComplete())                                                                        // 411
          onException(e);                                                                          // 412
      }                                                                                            // 413
    });                                                                                            // 414
  }                                                                                                // 415
});                                                                                                // 416
                                                                                                   // 417
/******************************************************************************/                   // 418
/* TestManager                                                                */                   // 419
/******************************************************************************/                   // 420
                                                                                                   // 421
TestManager = function () {                                                                        // 422
  var self = this;                                                                                 // 423
  self.tests = {};                                                                                 // 424
  self.ordered_tests = [];                                                                         // 425
  self.testQueue = Meteor.isServer && new Meteor._SynchronousQueue();                              // 426
};                                                                                                 // 427
                                                                                                   // 428
if (Meteor.isServer && process.env.TINYTEST_FILTER) {                                              // 429
  __meteor_runtime_config__.tinytestFilter = process.env.TINYTEST_FILTER;                          // 430
}                                                                                                  // 431
                                                                                                   // 432
_.extend(TestManager.prototype, {                                                                  // 433
  addCase: function (test) {                                                                       // 434
    var self = this;                                                                               // 435
    if (test.name in self.tests)                                                                   // 436
      throw new Error(                                                                             // 437
        "Every test needs a unique name, but there are two tests named '" +                        // 438
          test.name + "'");                                                                        // 439
    if (__meteor_runtime_config__.tinytestFilter &&                                                // 440
        test.name.indexOf(__meteor_runtime_config__.tinytestFilter) === -1) {                      // 441
      return;                                                                                      // 442
    }                                                                                              // 443
    self.tests[test.name] = test;                                                                  // 444
    self.ordered_tests.push(test);                                                                 // 445
  },                                                                                               // 446
                                                                                                   // 447
  createRun: function (onReport, pathPrefix) {                                                     // 448
    var self = this;                                                                               // 449
    return new TestRun(self, onReport, pathPrefix);                                                // 450
  }                                                                                                // 451
});                                                                                                // 452
                                                                                                   // 453
// singleton                                                                                       // 454
TestManager = new TestManager;                                                                     // 455
                                                                                                   // 456
/******************************************************************************/                   // 457
/* TestRun                                                                    */                   // 458
/******************************************************************************/                   // 459
                                                                                                   // 460
TestRun = function (manager, onReport, pathPrefix) {                                               // 461
  var self = this;                                                                                 // 462
  self.manager = manager;                                                                          // 463
  self.onReport = onReport;                                                                        // 464
  self.next_sequence_number = 0;                                                                   // 465
  self._pathPrefix = pathPrefix || [];                                                             // 466
  _.each(self.manager.ordered_tests, function (test) {                                             // 467
    if (self._prefixMatch(test.groupPath))                                                         // 468
      self._report(test);                                                                          // 469
  });                                                                                              // 470
};                                                                                                 // 471
                                                                                                   // 472
_.extend(TestRun.prototype, {                                                                      // 473
                                                                                                   // 474
  _prefixMatch: function (testPath) {                                                              // 475
    var self = this;                                                                               // 476
    for (var i = 0; i < self._pathPrefix.length; i++) {                                            // 477
      if (!testPath[i] || self._pathPrefix[i] !== testPath[i]) {                                   // 478
        return false;                                                                              // 479
      }                                                                                            // 480
    }                                                                                              // 481
    return true;                                                                                   // 482
  },                                                                                               // 483
                                                                                                   // 484
  _runTest: function (test, onComplete, stop_at_offset) {                                          // 485
    var self = this;                                                                               // 486
                                                                                                   // 487
    var startTime = (+new Date);                                                                   // 488
                                                                                                   // 489
    test.run(function (event) {                                                                    // 490
      /* onEvent */                                                                                // 491
      // Ignore result callbacks if the test has already been reported                             // 492
      // as timed out.                                                                             // 493
      if (test.timedOut)                                                                           // 494
        return;                                                                                    // 495
      self._report(test, event);                                                                   // 496
    }, function () {                                                                               // 497
      /* onComplete */                                                                             // 498
      if (test.timedOut)                                                                           // 499
        return;                                                                                    // 500
      var totalTime = (+new Date) - startTime;                                                     // 501
      self._report(test, {type: "finish", timeMs: totalTime});                                     // 502
      onComplete();                                                                                // 503
    }, function (exception) {                                                                      // 504
      /* onException */                                                                            // 505
      if (test.timedOut)                                                                           // 506
        return;                                                                                    // 507
                                                                                                   // 508
      // XXX you want the "name" and "message" fields on the                                       // 509
      // exception, to start with..                                                                // 510
      self._report(test, {                                                                         // 511
        type: "exception",                                                                         // 512
        details: {                                                                                 // 513
          message: exception.message, // XXX empty???                                              // 514
          stack: exception.stack // XXX portability                                                // 515
        }                                                                                          // 516
      });                                                                                          // 517
                                                                                                   // 518
      onComplete();                                                                                // 519
    }, stop_at_offset);                                                                            // 520
  },                                                                                               // 521
                                                                                                   // 522
  // Run a single test.  On the server, ensure that only one test runs                             // 523
  // at a time, even with multiple clients submitting tests.  However,                             // 524
  // time out the test after three minutes to avoid locking up the                                 // 525
  // server if a test fails to complete.                                                           // 526
  //                                                                                               // 527
  _runOne: function (test, onComplete, stop_at_offset) {                                           // 528
    var self = this;                                                                               // 529
                                                                                                   // 530
    if (! self._prefixMatch(test.groupPath)) {                                                     // 531
      onComplete && onComplete();                                                                  // 532
      return;                                                                                      // 533
    }                                                                                              // 534
                                                                                                   // 535
    if (Meteor.isServer) {                                                                         // 536
      // On the server, ensure that only one test runs at a time, even                             // 537
      // with multiple clients.                                                                    // 538
      self.manager.testQueue.queueTask(function () {                                               // 539
        // The future resolves when the test completes or times out.                               // 540
        var future = new Future();                                                                 // 541
        Meteor.setTimeout(                                                                         // 542
          function () {                                                                            // 543
            if (future.isResolved())                                                               // 544
              // If the future has resolved the test has completed.                                // 545
              return;                                                                              // 546
            test.timedOut = true;                                                                  // 547
            self._report(test, {                                                                   // 548
              type: "exception",                                                                   // 549
              details: {                                                                           // 550
                message: "test timed out"                                                          // 551
              }                                                                                    // 552
            });                                                                                    // 553
            future['return']();                                                                    // 554
          },                                                                                       // 555
          3 * 60 * 1000  // 3 minutes                                                              // 556
        );                                                                                         // 557
        self._runTest(test, function () {                                                          // 558
          // The test can complete after it has timed out (it might                                // 559
          // just be slow), so only resolve the future if the test                                 // 560
          // hasn't timed out.                                                                     // 561
          if (! future.isResolved())                                                               // 562
            future['return']();                                                                    // 563
        }, stop_at_offset);                                                                        // 564
        // Wait for the test to complete or time out.                                              // 565
        future.wait();                                                                             // 566
        onComplete && onComplete();                                                                // 567
      });                                                                                          // 568
    } else {                                                                                       // 569
      // client                                                                                    // 570
      self._runTest(test, function () {                                                            // 571
        onComplete && onComplete();                                                                // 572
      }, stop_at_offset);                                                                          // 573
    }                                                                                              // 574
  },                                                                                               // 575
                                                                                                   // 576
  run: function (onComplete) {                                                                     // 577
    var self = this;                                                                               // 578
    var tests = _.clone(self.manager.ordered_tests);                                               // 579
    var reportCurrent = function (name) {                                                          // 580
      if (Meteor.isClient)                                                                         // 581
        Tinytest._onCurrentClientTest(name);                                                       // 582
    };                                                                                             // 583
                                                                                                   // 584
    var runNext = function () {                                                                    // 585
      if (tests.length) {                                                                          // 586
        var t = tests.shift();                                                                     // 587
        reportCurrent(t.name);                                                                     // 588
        self._runOne(t, runNext);                                                                  // 589
      } else {                                                                                     // 590
        reportCurrent(null);                                                                       // 591
        onComplete && onComplete();                                                                // 592
      }                                                                                            // 593
    };                                                                                             // 594
                                                                                                   // 595
    runNext();                                                                                     // 596
  },                                                                                               // 597
                                                                                                   // 598
  // An alternative to run(). Given the 'cookie' attribute of a                                    // 599
  // failure record, try to rerun that particular test up to that                                  // 600
  // failure, and then open the debugger.                                                          // 601
  debug: function (cookie, onComplete) {                                                           // 602
    var self = this;                                                                               // 603
    var test = self.manager.tests[cookie.name];                                                    // 604
    if (!test)                                                                                     // 605
      throw new Error("No such test '" + cookie.name + "'");                                       // 606
    self._runOne(test, onComplete, cookie.offset);                                                 // 607
  },                                                                                               // 608
                                                                                                   // 609
  _report: function (test, event) {                                                                // 610
    var self = this;                                                                               // 611
    if (event)                                                                                     // 612
      var events = [_.extend({sequence: self.next_sequence_number++}, event)];                     // 613
    else                                                                                           // 614
      var events = [];                                                                             // 615
    self.onReport({                                                                                // 616
      groupPath: test.groupPath,                                                                   // 617
      test: test.shortName,                                                                        // 618
      events: events                                                                               // 619
    });                                                                                            // 620
  }                                                                                                // 621
});                                                                                                // 622
                                                                                                   // 623
/******************************************************************************/                   // 624
/* Public API                                                                 */                   // 625
/******************************************************************************/                   // 626
                                                                                                   // 627
Tinytest = {};                                                                                     // 628
                                                                                                   // 629
Tinytest.addAsync = function (name, func) {                                                        // 630
  TestManager.addCase(new TestCase(name, func));                                                   // 631
};                                                                                                 // 632
                                                                                                   // 633
Tinytest.add = function (name, func) {                                                             // 634
  Tinytest.addAsync(name, function (test, onComplete) {                                            // 635
    func(test);                                                                                    // 636
    onComplete();                                                                                  // 637
  });                                                                                              // 638
};                                                                                                 // 639
                                                                                                   // 640
// Run every test, asynchronously. Runs the test in the current                                    // 641
// process only (if called on the server, runs the tests on the                                    // 642
// server, and likewise for the client.) Report results via                                        // 643
// onReport. Call onComplete when it's done.                                                       // 644
//                                                                                                 // 645
Tinytest._runTests = function (onReport, onComplete, pathPrefix) {                                 // 646
  var testRun = TestManager.createRun(onReport, pathPrefix);                                       // 647
  testRun.run(onComplete);                                                                         // 648
};                                                                                                 // 649
                                                                                                   // 650
// Run just one test case, and stop the debugger at a particular                                   // 651
// error, all as indicated by 'cookie', which will have come from a                                // 652
// failure event output by _runTests.                                                              // 653
//                                                                                                 // 654
Tinytest._debugTest = function (cookie, onReport, onComplete) {                                    // 655
  var testRun = TestManager.createRun(onReport);                                                   // 656
  testRun.debug(cookie, onComplete);                                                               // 657
};                                                                                                 // 658
                                                                                                   // 659
// Replace this callback to get called when we run a client test,                                  // 660
// and then called with `null` when the client tests are                                           // 661
// done.  This is used to provide a live display of the current                                    // 662
// running client test on the test results page.                                                   // 663
Tinytest._onCurrentClientTest = function (name) {};                                                // 664
                                                                                                   // 665
/////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                 //
// packages/tinytest/model.js                                                                      //
//                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                   //
Meteor._ServerTestResultsSubscription = 'tinytest_results_subscription';                           // 1
Meteor._ServerTestResultsCollection = 'tinytest_results_collection';                               // 2
                                                                                                   // 3
/////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                 //
// packages/tinytest/tinytest_server.js                                                            //
//                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                   //
var Fiber = Npm.require('fibers');                                                                 // 1
var handlesForRun = {};                                                                            // 2
var reportsForRun = {};                                                                            // 3
                                                                                                   // 4
Meteor.publish(Meteor._ServerTestResultsSubscription, function (runId) {                           // 5
  check(runId, String);                                                                            // 6
  var self = this;                                                                                 // 7
  if (!_.has(handlesForRun, runId))                                                                // 8
    handlesForRun[runId] = [self];                                                                 // 9
  else                                                                                             // 10
    handlesForRun[runId].push(self);                                                               // 11
  self.onStop(function () {                                                                        // 12
    handlesForRun[runId] = _.without(handlesForRun[runId], self);                                  // 13
  });                                                                                              // 14
  if (_.has(reportsForRun, runId)) {                                                               // 15
    self.added(Meteor._ServerTestResultsCollection, runId,                                         // 16
               reportsForRun[runId]);                                                              // 17
  } else {                                                                                         // 18
    self.added(Meteor._ServerTestResultsCollection, runId, {});                                    // 19
  }                                                                                                // 20
  self.ready();                                                                                    // 21
});                                                                                                // 22
                                                                                                   // 23
Meteor.methods({                                                                                   // 24
  'tinytest/run': function (runId, pathPrefix) {                                                   // 25
    check(runId, String);                                                                          // 26
    check(pathPrefix, Match.Optional([String]));                                                   // 27
    this.unblock();                                                                                // 28
                                                                                                   // 29
    reportsForRun[runId] = {};                                                                     // 30
                                                                                                   // 31
    var addReport = function (key, report) {                                                       // 32
      var fields = {};                                                                             // 33
      fields[key] = report;                                                                        // 34
      _.each(handlesForRun[runId], function (handle) {                                             // 35
        handle.changed(Meteor._ServerTestResultsCollection, runId, fields);                        // 36
      });                                                                                          // 37
      // Save for future subscriptions.                                                            // 38
      reportsForRun[runId][key] = report;                                                          // 39
    };                                                                                             // 40
                                                                                                   // 41
    var onReport = function (report) {                                                             // 42
      if (! Fiber.current) {                                                                       // 43
        Meteor._debug("Trying to report a test not in a fiber! "+                                  // 44
                      "You probably forgot to wrap a callback in bindEnvironment.");               // 45
        console.trace();                                                                           // 46
      }                                                                                            // 47
      var dummyKey = Random.id();                                                                  // 48
      addReport(dummyKey, report);                                                                 // 49
    };                                                                                             // 50
                                                                                                   // 51
    var onComplete = function() {                                                                  // 52
      // We send an object for current and future compatibility,                                   // 53
      // though we could get away with just sending { complete: true }                             // 54
      var report = { done: true };                                                                 // 55
      var key = 'complete';                                                                        // 56
      addReport(key, report);                                                                      // 57
    };                                                                                             // 58
                                                                                                   // 59
    Tinytest._runTests(onReport, onComplete, pathPrefix);                                          // 60
  },                                                                                               // 61
  'tinytest/clearResults': function (runId) {                                                      // 62
    check(runId, String);                                                                          // 63
    _.each(handlesForRun[runId], function (handle) {                                               // 64
      // XXX this doesn't actually notify the client that it has been                              // 65
      // unsubscribed.                                                                             // 66
      handle.stop();                                                                               // 67
    });                                                                                            // 68
    delete handlesForRun[runId];                                                                   // 69
    delete reportsForRun[runId];                                                                   // 70
  }                                                                                                // 71
});                                                                                                // 72
                                                                                                   // 73
/////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
