(function () {

//////////////////////////////////////////////////////////////////////////////////////
//                                                                                  //
// packages/webapp/webapp_server.js                                                 //
//                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////
                                                                                    //
////////// Requires //////////                                                      // 1
                                                                                    // 2
var fs = Npm.require("fs");                                                         // 3
var http = Npm.require("http");                                                     // 4
var os = Npm.require("os");                                                         // 5
var path = Npm.require("path");                                                     // 6
var url = Npm.require("url");                                                       // 7
var crypto = Npm.require("crypto");                                                 // 8
                                                                                    // 9
var connect = Npm.require('connect');                                               // 10
var useragent = Npm.require('useragent');                                           // 11
var send = Npm.require('send');                                                     // 12
                                                                                    // 13
var Future = Npm.require('fibers/future');                                          // 14
var Fiber = Npm.require('fibers');                                                  // 15
                                                                                    // 16
var SHORT_SOCKET_TIMEOUT = 5*1000;                                                  // 17
var LONG_SOCKET_TIMEOUT = 120*1000;                                                 // 18
                                                                                    // 19
WebApp = {};                                                                        // 20
WebAppInternals = {};                                                               // 21
                                                                                    // 22
WebApp.defaultArch = 'web.browser';                                                 // 23
                                                                                    // 24
// XXX maps archs to manifests                                                      // 25
WebApp.clientPrograms = {};                                                         // 26
                                                                                    // 27
// XXX maps archs to program path on filesystem                                     // 28
var archPath = {};                                                                  // 29
                                                                                    // 30
var bundledJsCssPrefix;                                                             // 31
                                                                                    // 32
var sha1 = function (contents) {                                                    // 33
  var hash = crypto.createHash('sha1');                                             // 34
  hash.update(contents);                                                            // 35
  return hash.digest('hex');                                                        // 36
};                                                                                  // 37
                                                                                    // 38
var readUtf8FileSync = function (filename) {                                        // 39
  return Meteor.wrapAsync(fs.readFile)(filename, 'utf8');                           // 40
};                                                                                  // 41
                                                                                    // 42
// #BrowserIdentification                                                           // 43
//                                                                                  // 44
// We have multiple places that want to identify the browser: the                   // 45
// unsupported browser page, the appcache package, and, eventually                  // 46
// delivering browser polyfills only as needed.                                     // 47
//                                                                                  // 48
// To avoid detecting the browser in multiple places ad-hoc, we create a            // 49
// Meteor "browser" object. It uses but does not expose the npm                     // 50
// useragent module (we could choose a different mechanism to identify              // 51
// the browser in the future if we wanted to).  The browser object                  // 52
// contains                                                                         // 53
//                                                                                  // 54
// * `name`: the name of the browser in camel case                                  // 55
// * `major`, `minor`, `patch`: integers describing the browser version             // 56
//                                                                                  // 57
// Also here is an early version of a Meteor `request` object, intended             // 58
// to be a high-level description of the request without exposing                   // 59
// details of connect's low-level `req`.  Currently it contains:                    // 60
//                                                                                  // 61
// * `browser`: browser identification object described above                       // 62
// * `url`: parsed url, including parsed query params                               // 63
//                                                                                  // 64
// As a temporary hack there is a `categorizeRequest` function on WebApp which      // 65
// converts a connect `req` to a Meteor `request`. This can go away once smart      // 66
// packages such as appcache are being passed a `request` object directly when      // 67
// they serve content.                                                              // 68
//                                                                                  // 69
// This allows `request` to be used uniformly: it is passed to the html             // 70
// attributes hook, and the appcache package can use it when deciding               // 71
// whether to generate a 404 for the manifest.                                      // 72
//                                                                                  // 73
// Real routing / server side rendering will probably refactor this                 // 74
// heavily.                                                                         // 75
                                                                                    // 76
                                                                                    // 77
// e.g. "Mobile Safari" => "mobileSafari"                                           // 78
var camelCase = function (name) {                                                   // 79
  var parts = name.split(' ');                                                      // 80
  parts[0] = parts[0].toLowerCase();                                                // 81
  for (var i = 1;  i < parts.length;  ++i) {                                        // 82
    parts[i] = parts[i].charAt(0).toUpperCase() + parts[i].substr(1);               // 83
  }                                                                                 // 84
  return parts.join('');                                                            // 85
};                                                                                  // 86
                                                                                    // 87
var identifyBrowser = function (userAgentString) {                                  // 88
  var userAgent = useragent.lookup(userAgentString);                                // 89
  return {                                                                          // 90
    name: camelCase(userAgent.family),                                              // 91
    major: +userAgent.major,                                                        // 92
    minor: +userAgent.minor,                                                        // 93
    patch: +userAgent.patch                                                         // 94
  };                                                                                // 95
};                                                                                  // 96
                                                                                    // 97
// XXX Refactor as part of implementing real routing.                               // 98
WebAppInternals.identifyBrowser = identifyBrowser;                                  // 99
                                                                                    // 100
WebApp.categorizeRequest = function (req) {                                         // 101
  return {                                                                          // 102
    browser: identifyBrowser(req.headers['user-agent']),                            // 103
    url: url.parse(req.url, true)                                                   // 104
  };                                                                                // 105
};                                                                                  // 106
                                                                                    // 107
// HTML attribute hooks: functions to be called to determine any attributes to      // 108
// be added to the '<html>' tag. Each function is passed a 'request' object (see    // 109
// #BrowserIdentification) and should return null or object.                        // 110
var htmlAttributeHooks = [];                                                        // 111
var getHtmlAttributes = function (request) {                                        // 112
  var combinedAttributes  = {};                                                     // 113
  _.each(htmlAttributeHooks || [], function (hook) {                                // 114
    var attributes = hook(request);                                                 // 115
    if (attributes === null)                                                        // 116
      return;                                                                       // 117
    if (typeof attributes !== 'object')                                             // 118
      throw Error("HTML attribute hook must return null or object");                // 119
    _.extend(combinedAttributes, attributes);                                       // 120
  });                                                                               // 121
  return combinedAttributes;                                                        // 122
};                                                                                  // 123
WebApp.addHtmlAttributeHook = function (hook) {                                     // 124
  htmlAttributeHooks.push(hook);                                                    // 125
};                                                                                  // 126
                                                                                    // 127
// Serve app HTML for this URL?                                                     // 128
var appUrl = function (url) {                                                       // 129
  if (url === '/favicon.ico' || url === '/robots.txt')                              // 130
    return false;                                                                   // 131
                                                                                    // 132
  // NOTE: app.manifest is not a web standard like favicon.ico and                  // 133
  // robots.txt. It is a file name we have chosen to use for HTML5                  // 134
  // appcache URLs. It is included here to prevent using an appcache                // 135
  // then removing it from poisoning an app permanently. Eventually,                // 136
  // once we have server side routing, this won't be needed as                      // 137
  // unknown URLs with return a 404 automatically.                                  // 138
  if (url === '/app.manifest')                                                      // 139
    return false;                                                                   // 140
                                                                                    // 141
  // Avoid serving app HTML for declared routes such as /sockjs/.                   // 142
  if (RoutePolicy.classify(url))                                                    // 143
    return false;                                                                   // 144
                                                                                    // 145
  // we currently return app HTML on all URLs by default                            // 146
  return true;                                                                      // 147
};                                                                                  // 148
                                                                                    // 149
                                                                                    // 150
// We need to calculate the client hash after all packages have loaded              // 151
// to give them a chance to populate __meteor_runtime_config__.                     // 152
//                                                                                  // 153
// Calculating the hash during startup means that packages can only                 // 154
// populate __meteor_runtime_config__ during load, not during startup.              // 155
//                                                                                  // 156
// Calculating instead it at the beginning of main after all startup                // 157
// hooks had run would allow packages to also populate                              // 158
// __meteor_runtime_config__ during startup, but that's too late for                // 159
// autoupdate because it needs to have the client hash at startup to                // 160
// insert the auto update version itself into                                       // 161
// __meteor_runtime_config__ to get it to the client.                               // 162
//                                                                                  // 163
// An alternative would be to give autoupdate a "post-start,                        // 164
// pre-listen" hook to allow it to insert the auto update version at                // 165
// the right moment.                                                                // 166
                                                                                    // 167
Meteor.startup(function () {                                                        // 168
  var calculateClientHash = WebAppHashing.calculateClientHash;                      // 169
  WebApp.clientHash = function (archName) {                                         // 170
    archName = archName || WebApp.defaultArch;                                      // 171
    return calculateClientHash(WebApp.clientPrograms[archName].manifest);           // 172
  };                                                                                // 173
                                                                                    // 174
  WebApp.calculateClientHashRefreshable = function (archName) {                     // 175
    archName = archName || WebApp.defaultArch;                                      // 176
    return calculateClientHash(WebApp.clientPrograms[archName].manifest,            // 177
      function (name) {                                                             // 178
        return name === "css";                                                      // 179
      });                                                                           // 180
  };                                                                                // 181
  WebApp.calculateClientHashNonRefreshable = function (archName) {                  // 182
    archName = archName || WebApp.defaultArch;                                      // 183
    return calculateClientHash(WebApp.clientPrograms[archName].manifest,            // 184
      function (name) {                                                             // 185
        return name !== "css";                                                      // 186
      });                                                                           // 187
  };                                                                                // 188
  WebApp.calculateClientHashCordova = function () {                                 // 189
    var archName = 'web.cordova';                                                   // 190
    if (! WebApp.clientPrograms[archName])                                          // 191
      return 'none';                                                                // 192
                                                                                    // 193
    return calculateClientHash(                                                     // 194
      WebApp.clientPrograms[archName].manifest, null, _.pick(                       // 195
        __meteor_runtime_config__, 'PUBLIC_SETTINGS'));                             // 196
  };                                                                                // 197
});                                                                                 // 198
                                                                                    // 199
                                                                                    // 200
                                                                                    // 201
// When we have a request pending, we want the socket timeout to be long, to        // 202
// give ourselves a while to serve it, and to allow sockjs long polls to            // 203
// complete.  On the other hand, we want to close idle sockets relatively           // 204
// quickly, so that we can shut down relatively promptly but cleanly, without       // 205
// cutting off anyone's response.                                                   // 206
WebApp._timeoutAdjustmentRequestCallback = function (req, res) {                    // 207
  // this is really just req.socket.setTimeout(LONG_SOCKET_TIMEOUT);                // 208
  req.setTimeout(LONG_SOCKET_TIMEOUT);                                              // 209
  // Insert our new finish listener to run BEFORE the existing one which removes    // 210
  // the response from the socket.                                                  // 211
  var finishListeners = res.listeners('finish');                                    // 212
  // XXX Apparently in Node 0.12 this event is now called 'prefinish'.              // 213
  // https://github.com/joyent/node/commit/7c9b6070                                 // 214
  res.removeAllListeners('finish');                                                 // 215
  res.on('finish', function () {                                                    // 216
    res.setTimeout(SHORT_SOCKET_TIMEOUT);                                           // 217
  });                                                                               // 218
  _.each(finishListeners, function (l) { res.on('finish', l); });                   // 219
};                                                                                  // 220
                                                                                    // 221
                                                                                    // 222
// Will be updated by main before we listen.                                        // 223
// Map from client arch to boilerplate object.                                      // 224
// Boilerplate object has:                                                          // 225
//   - func: XXX                                                                    // 226
//   - baseData: XXX                                                                // 227
var boilerplateByArch = {};                                                         // 228
                                                                                    // 229
// Given a request (as returned from `categorizeRequest`), return the               // 230
// boilerplate HTML to serve for that request. Memoizes on HTML                     // 231
// attributes (used by, eg, appcache) and whether inline scripts are                // 232
// currently allowed.                                                               // 233
// XXX so far this function is always called with arch === 'web.browser'            // 234
var memoizedBoilerplate = {};                                                       // 235
var getBoilerplate = function (request, arch) {                                     // 236
                                                                                    // 237
  var htmlAttributes = getHtmlAttributes(request);                                  // 238
                                                                                    // 239
  // The only thing that changes from request to request (for now) are              // 240
  // the HTML attributes (used by, eg, appcache) and whether inline                 // 241
  // scripts are allowed, so we can memoize based on that.                          // 242
  var memHash = JSON.stringify({                                                    // 243
    inlineScriptsAllowed: inlineScriptsAllowed,                                     // 244
    htmlAttributes: htmlAttributes,                                                 // 245
    arch: arch                                                                      // 246
  });                                                                               // 247
                                                                                    // 248
  if (! memoizedBoilerplate[memHash]) {                                             // 249
    memoizedBoilerplate[memHash] = boilerplateByArch[arch].toHTML({                 // 250
      htmlAttributes: htmlAttributes                                                // 251
    });                                                                             // 252
  }                                                                                 // 253
  return memoizedBoilerplate[memHash];                                              // 254
};                                                                                  // 255
                                                                                    // 256
WebAppInternals.generateBoilerplateInstance = function (arch,                       // 257
                                                        manifest,                   // 258
                                                        additionalOptions) {        // 259
  additionalOptions = additionalOptions || {};                                      // 260
                                                                                    // 261
  var runtimeConfig = _.extend(                                                     // 262
    _.clone(__meteor_runtime_config__),                                             // 263
    additionalOptions.runtimeConfigOverrides || {}                                  // 264
  );                                                                                // 265
                                                                                    // 266
  var jsCssPrefix;                                                                  // 267
  if (arch === 'web.cordova') {                                                     // 268
    // in cordova we serve assets up directly from disk so it doesn't make          // 269
    // sense to use the prefix (ordinarily something like a CDN) and go out         // 270
    // to the internet for those files.                                             // 271
    jsCssPrefix = '';                                                               // 272
  } else {                                                                          // 273
    jsCssPrefix = bundledJsCssPrefix ||                                             // 274
      __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || '';                         // 275
  }                                                                                 // 276
                                                                                    // 277
  return new Boilerplate(arch, manifest,                                            // 278
    _.extend({                                                                      // 279
      pathMapper: function (itemPath) {                                             // 280
        return path.join(archPath[arch], itemPath); },                              // 281
      baseDataExtension: {                                                          // 282
        additionalStaticJs: _.map(                                                  // 283
          additionalStaticJs || [],                                                 // 284
          function (contents, pathname) {                                           // 285
            return {                                                                // 286
              pathname: pathname,                                                   // 287
              contents: contents                                                    // 288
            };                                                                      // 289
          }                                                                         // 290
        ),                                                                          // 291
        // Convert to a JSON string, then get rid of most weird characters, then    // 292
        // wrap in double quotes. (The outermost JSON.stringify really ought to     // 293
        // just be "wrap in double quotes" but we use it to be safe.) This might    // 294
        // end up inside a <script> tag so we need to be careful to not include     // 295
        // "</script>", but normal {{spacebars}} escaping escapes too much! See     // 296
        // https://github.com/meteor/meteor/issues/3730                             // 297
        meteorRuntimeConfig: JSON.stringify(                                        // 298
          encodeURIComponent(JSON.stringify(runtimeConfig))),                       // 299
        rootUrlPathPrefix: __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || '',    // 300
        bundledJsCssPrefix: jsCssPrefix,                                            // 301
        inlineScriptsAllowed: WebAppInternals.inlineScriptsAllowed(),               // 302
        inline: additionalOptions.inline                                            // 303
      }                                                                             // 304
    }, additionalOptions)                                                           // 305
  );                                                                                // 306
};                                                                                  // 307
                                                                                    // 308
// A mapping from url path to "info". Where "info" has the following fields:        // 309
// - type: the type of file to be served                                            // 310
// - cacheable: optionally, whether the file should be cached or not                // 311
// - sourceMapUrl: optionally, the url of the source map                            // 312
//                                                                                  // 313
// Info also contains one of the following:                                         // 314
// - content: the stringified content that should be served at this path            // 315
// - absolutePath: the absolute path on disk to the file                            // 316
                                                                                    // 317
var staticFiles;                                                                    // 318
                                                                                    // 319
// Serve static files from the manifest or added with                               // 320
// `addStaticJs`. Exported for tests.                                               // 321
WebAppInternals.staticFilesMiddleware = function (staticFiles, req, res, next) {    // 322
  if ('GET' != req.method && 'HEAD' != req.method) {                                // 323
    next();                                                                         // 324
    return;                                                                         // 325
  }                                                                                 // 326
  var pathname = connect.utils.parseUrl(req).pathname;                              // 327
  try {                                                                             // 328
    pathname = decodeURIComponent(pathname);                                        // 329
  } catch (e) {                                                                     // 330
    next();                                                                         // 331
    return;                                                                         // 332
  }                                                                                 // 333
                                                                                    // 334
  var serveStaticJs = function (s) {                                                // 335
    res.writeHead(200, {                                                            // 336
      'Content-type': 'application/javascript; charset=UTF-8'                       // 337
    });                                                                             // 338
    res.write(s);                                                                   // 339
    res.end();                                                                      // 340
  };                                                                                // 341
                                                                                    // 342
  if (pathname === "/meteor_runtime_config.js" &&                                   // 343
      ! WebAppInternals.inlineScriptsAllowed()) {                                   // 344
    serveStaticJs("__meteor_runtime_config__ = " +                                  // 345
                  JSON.stringify(__meteor_runtime_config__) + ";");                 // 346
    return;                                                                         // 347
  } else if (_.has(additionalStaticJs, pathname) &&                                 // 348
              ! WebAppInternals.inlineScriptsAllowed()) {                           // 349
    serveStaticJs(additionalStaticJs[pathname]);                                    // 350
    return;                                                                         // 351
  }                                                                                 // 352
                                                                                    // 353
  if (!_.has(staticFiles, pathname)) {                                              // 354
    next();                                                                         // 355
    return;                                                                         // 356
  }                                                                                 // 357
                                                                                    // 358
  // We don't need to call pause because, unlike 'static', once we call into        // 359
  // 'send' and yield to the event loop, we never call another handler with         // 360
  // 'next'.                                                                        // 361
                                                                                    // 362
  var info = staticFiles[pathname];                                                 // 363
                                                                                    // 364
  // Cacheable files are files that should never change. Typically                  // 365
  // named by their hash (eg meteor bundled js and css files).                      // 366
  // We cache them ~forever (1yr).                                                  // 367
  //                                                                                // 368
  // We cache non-cacheable files anyway. This isn't really correct, as users       // 369
  // can change the files and changes won't propagate immediately. However, if      // 370
  // we don't cache them, browsers will 'flicker' when rerendering                  // 371
  // images. Eventually we will probably want to rewrite URLs of static assets      // 372
  // to include a query parameter to bust caches. That way we can both get          // 373
  // good caching behavior and allow users to change assets without delay.          // 374
  // https://github.com/meteor/meteor/issues/773                                    // 375
  var maxAge = info.cacheable                                                       // 376
        ? 1000 * 60 * 60 * 24 * 365                                                 // 377
        : 1000 * 60 * 60 * 24;                                                      // 378
                                                                                    // 379
  // Set the X-SourceMap header, which current Chrome, FireFox, and Safari          // 380
  // understand.  (The SourceMap header is slightly more spec-correct but FF        // 381
  // doesn't understand it.)                                                        // 382
  //                                                                                // 383
  // You may also need to enable source maps in Chrome: open dev tools, click       // 384
  // the gear in the bottom right corner, and select "enable source maps".          // 385
  if (info.sourceMapUrl) {                                                          // 386
    res.setHeader('X-SourceMap',                                                    // 387
                  __meteor_runtime_config__.ROOT_URL_PATH_PREFIX +                  // 388
                  info.sourceMapUrl);                                               // 389
  }                                                                                 // 390
                                                                                    // 391
  if (info.type === "js") {                                                         // 392
    res.setHeader("Content-Type", "application/javascript; charset=UTF-8");         // 393
  } else if (info.type === "css") {                                                 // 394
    res.setHeader("Content-Type", "text/css; charset=UTF-8");                       // 395
  } else if (info.type === "json") {                                                // 396
    res.setHeader("Content-Type", "application/json; charset=UTF-8");               // 397
    // XXX if it is a manifest we are serving, set additional headers               // 398
    if (/\/manifest.json$/.test(pathname)) {                                        // 399
      res.setHeader("Access-Control-Allow-Origin", "*");                            // 400
    }                                                                               // 401
  }                                                                                 // 402
                                                                                    // 403
  if (info.content) {                                                               // 404
    res.write(info.content);                                                        // 405
    res.end();                                                                      // 406
  } else {                                                                          // 407
    send(req, info.absolutePath)                                                    // 408
      .maxage(maxAge)                                                               // 409
      .hidden(true)  // if we specified a dotfile in the manifest, serve it         // 410
      .on('error', function (err) {                                                 // 411
        Log.error("Error serving static file " + err);                              // 412
        res.writeHead(500);                                                         // 413
        res.end();                                                                  // 414
      })                                                                            // 415
      .on('directory', function () {                                                // 416
        Log.error("Unexpected directory " + info.absolutePath);                     // 417
        res.writeHead(500);                                                         // 418
        res.end();                                                                  // 419
      })                                                                            // 420
      .pipe(res);                                                                   // 421
  }                                                                                 // 422
};                                                                                  // 423
                                                                                    // 424
var getUrlPrefixForArch = function (arch) {                                         // 425
  // XXX we rely on the fact that arch names don't contain slashes                  // 426
  // in that case we would need to uri escape it                                    // 427
                                                                                    // 428
  // We add '__' to the beginning of non-standard archs to "scope" the url          // 429
  // to Meteor internals.                                                           // 430
  return arch === WebApp.defaultArch ?                                              // 431
    '' : '/' + '__' + arch.replace(/^web\./, '');                                   // 432
};                                                                                  // 433
                                                                                    // 434
var runWebAppServer = function () {                                                 // 435
  var shuttingDown = false;                                                         // 436
  var syncQueue = new Meteor._SynchronousQueue();                                   // 437
                                                                                    // 438
  var getItemPathname = function (itemUrl) {                                        // 439
    return decodeURIComponent(url.parse(itemUrl).pathname);                         // 440
  };                                                                                // 441
                                                                                    // 442
  WebAppInternals.reloadClientPrograms = function () {                              // 443
    syncQueue.runTask(function() {                                                  // 444
      staticFiles = {};                                                             // 445
      var generateClientProgram = function (clientPath, arch) {                     // 446
        // read the control for the client we'll be serving up                      // 447
        var clientJsonPath = path.join(__meteor_bootstrap__.serverDir,              // 448
                                   clientPath);                                     // 449
        var clientDir = path.dirname(clientJsonPath);                               // 450
        var clientJson = JSON.parse(readUtf8FileSync(clientJsonPath));              // 451
        if (clientJson.format !== "web-program-pre1")                               // 452
          throw new Error("Unsupported format for client assets: " +                // 453
                          JSON.stringify(clientJson.format));                       // 454
                                                                                    // 455
        if (! clientJsonPath || ! clientDir || ! clientJson)                        // 456
          throw new Error("Client config file not parsed.");                        // 457
                                                                                    // 458
        var urlPrefix = getUrlPrefixForArch(arch);                                  // 459
                                                                                    // 460
        var manifest = clientJson.manifest;                                         // 461
        _.each(manifest, function (item) {                                          // 462
          if (item.url && item.where === "client") {                                // 463
            staticFiles[urlPrefix + getItemPathname(item.url)] = {                  // 464
              absolutePath: path.join(clientDir, item.path),                        // 465
              cacheable: item.cacheable,                                            // 466
              // Link from source to its map                                        // 467
              sourceMapUrl: item.sourceMapUrl,                                      // 468
              type: item.type                                                       // 469
            };                                                                      // 470
                                                                                    // 471
            if (item.sourceMap) {                                                   // 472
              // Serve the source map too, under the specified URL. We assume all   // 473
              // source maps are cacheable.                                         // 474
              staticFiles[urlPrefix + getItemPathname(item.sourceMapUrl)] = {       // 475
                absolutePath: path.join(clientDir, item.sourceMap),                 // 476
                cacheable: true                                                     // 477
              };                                                                    // 478
            }                                                                       // 479
          }                                                                         // 480
        });                                                                         // 481
                                                                                    // 482
        var program = {                                                             // 483
          manifest: manifest,                                                       // 484
          version: WebAppHashing.calculateClientHash(manifest, null, _.pick(        // 485
            __meteor_runtime_config__, 'PUBLIC_SETTINGS')),                         // 486
          PUBLIC_SETTINGS: __meteor_runtime_config__.PUBLIC_SETTINGS                // 487
        };                                                                          // 488
                                                                                    // 489
        WebApp.clientPrograms[arch] = program;                                      // 490
                                                                                    // 491
        // Serve the program as a string at /foo/<arch>/manifest.json               // 492
        // XXX change manifest.json -> program.json                                 // 493
        staticFiles[path.join(urlPrefix, 'manifest.json')] = {                      // 494
          content: JSON.stringify(program),                                         // 495
          cacheable: true,                                                          // 496
          type: "json"                                                              // 497
        };                                                                          // 498
      };                                                                            // 499
                                                                                    // 500
      try {                                                                         // 501
        var clientPaths = __meteor_bootstrap__.configJson.clientPaths;              // 502
        _.each(clientPaths, function (clientPath, arch) {                           // 503
          archPath[arch] = path.dirname(clientPath);                                // 504
          generateClientProgram(clientPath, arch);                                  // 505
        });                                                                         // 506
                                                                                    // 507
        // Exported for tests.                                                      // 508
        WebAppInternals.staticFiles = staticFiles;                                  // 509
      } catch (e) {                                                                 // 510
        Log.error("Error reloading the client program: " + e.stack);                // 511
        process.exit(1);                                                            // 512
      }                                                                             // 513
    });                                                                             // 514
  };                                                                                // 515
                                                                                    // 516
  WebAppInternals.generateBoilerplate = function () {                               // 517
    // This boilerplate will be served to the mobile devices when used with         // 518
    // Meteor/Cordova for the Hot-Code Push and since the file will be served by    // 519
    // the device's server, it is important to set the DDP url to the actual        // 520
    // Meteor server accepting DDP connections and not the device's file server.    // 521
    var defaultOptionsForArch = {                                                   // 522
      'web.cordova': {                                                              // 523
        runtimeConfigOverrides: {                                                   // 524
          // XXX We use absoluteUrl() here so that we serve https://                // 525
          // URLs to cordova clients if force-ssl is in use. If we were             // 526
          // to use __meteor_runtime_config__.ROOT_URL instead of                   // 527
          // absoluteUrl(), then Cordova clients would immediately get a            // 528
          // HCP setting their DDP_DEFAULT_CONNECTION_URL to                        // 529
          // http://example.meteor.com. This breaks the app, because                // 530
          // force-ssl doesn't serve CORS headers on 302                            // 531
          // redirects. (Plus it's undesirable to have clients                      // 532
          // connecting to http://example.meteor.com when force-ssl is              // 533
          // in use.)                                                               // 534
          DDP_DEFAULT_CONNECTION_URL: process.env.MOBILE_DDP_URL ||                 // 535
            Meteor.absoluteUrl(),                                                   // 536
          ROOT_URL: process.env.MOBILE_ROOT_URL ||                                  // 537
            Meteor.absoluteUrl()                                                    // 538
        }                                                                           // 539
      }                                                                             // 540
    };                                                                              // 541
                                                                                    // 542
    syncQueue.runTask(function() {                                                  // 543
      _.each(WebApp.clientPrograms, function (program, archName) {                  // 544
        boilerplateByArch[archName] =                                               // 545
          WebAppInternals.generateBoilerplateInstance(                              // 546
            archName, program.manifest,                                             // 547
            defaultOptionsForArch[archName]);                                       // 548
      });                                                                           // 549
                                                                                    // 550
      // Clear the memoized boilerplate cache.                                      // 551
      memoizedBoilerplate = {};                                                     // 552
                                                                                    // 553
      // Configure CSS injection for the default arch                               // 554
      // XXX implement the CSS injection for all archs?                             // 555
      WebAppInternals.refreshableAssets = {                                         // 556
        allCss: boilerplateByArch[WebApp.defaultArch].baseData.css                  // 557
      };                                                                            // 558
    });                                                                             // 559
  };                                                                                // 560
                                                                                    // 561
  WebAppInternals.reloadClientPrograms();                                           // 562
                                                                                    // 563
  // webserver                                                                      // 564
  var app = connect();                                                              // 565
                                                                                    // 566
  // Auto-compress any json, javascript, or text.                                   // 567
  app.use(connect.compress());                                                      // 568
                                                                                    // 569
  // Packages and apps can add handlers that run before any other Meteor            // 570
  // handlers via WebApp.rawConnectHandlers.                                        // 571
  var rawConnectHandlers = connect();                                               // 572
  app.use(rawConnectHandlers);                                                      // 573
                                                                                    // 574
  // We're not a proxy; reject (without crashing) attempts to treat us like         // 575
  // one. (See #1212.)                                                              // 576
  app.use(function(req, res, next) {                                                // 577
    if (RoutePolicy.isValidUrl(req.url)) {                                          // 578
      next();                                                                       // 579
      return;                                                                       // 580
    }                                                                               // 581
    res.writeHead(400);                                                             // 582
    res.write("Not a proxy");                                                       // 583
    res.end();                                                                      // 584
  });                                                                               // 585
                                                                                    // 586
  // Strip off the path prefix, if it exists.                                       // 587
  app.use(function (request, response, next) {                                      // 588
    var pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX;                // 589
    var url = Npm.require('url').parse(request.url);                                // 590
    var pathname = url.pathname;                                                    // 591
    // check if the path in the url starts with the path prefix (and the part       // 592
    // after the path prefix must start with a / if it exists.)                     // 593
    if (pathPrefix && pathname.substring(0, pathPrefix.length) === pathPrefix &&    // 594
       (pathname.length == pathPrefix.length                                        // 595
        || pathname.substring(pathPrefix.length, pathPrefix.length + 1) === "/")) { // 596
      request.url = request.url.substring(pathPrefix.length);                       // 597
      next();                                                                       // 598
    } else if (pathname === "/favicon.ico" || pathname === "/robots.txt") {         // 599
      next();                                                                       // 600
    } else if (pathPrefix) {                                                        // 601
      response.writeHead(404);                                                      // 602
      response.write("Unknown path");                                               // 603
      response.end();                                                               // 604
    } else {                                                                        // 605
      next();                                                                       // 606
    }                                                                               // 607
  });                                                                               // 608
                                                                                    // 609
  // Parse the query string into res.query. Used by oauth_server, but it's          // 610
  // generally pretty handy..                                                       // 611
  app.use(connect.query());                                                         // 612
                                                                                    // 613
  // Serve static files from the manifest.                                          // 614
  // This is inspired by the 'static' middleware.                                   // 615
  app.use(function (req, res, next) {                                               // 616
    Fiber(function () {                                                             // 617
     WebAppInternals.staticFilesMiddleware(staticFiles, req, res, next);            // 618
    }).run();                                                                       // 619
  });                                                                               // 620
                                                                                    // 621
  // Packages and apps can add handlers to this via WebApp.connectHandlers.         // 622
  // They are inserted before our default handler.                                  // 623
  var packageAndAppHandlers = connect();                                            // 624
  app.use(packageAndAppHandlers);                                                   // 625
                                                                                    // 626
  var suppressConnectErrors = false;                                                // 627
  // connect knows it is an error handler because it has 4 arguments instead of     // 628
  // 3. go figure.  (It is not smart enough to find such a thing if it's hidden     // 629
  // inside packageAndAppHandlers.)                                                 // 630
  app.use(function (err, req, res, next) {                                          // 631
    if (!err || !suppressConnectErrors || !req.headers['x-suppress-error']) {       // 632
      next(err);                                                                    // 633
      return;                                                                       // 634
    }                                                                               // 635
    res.writeHead(err.status, { 'Content-Type': 'text/plain' });                    // 636
    res.end("An error message");                                                    // 637
  });                                                                               // 638
                                                                                    // 639
  app.use(function (req, res, next) {                                               // 640
    if (! appUrl(req.url))                                                          // 641
      return next();                                                                // 642
                                                                                    // 643
    var headers = {                                                                 // 644
      'Content-Type':  'text/html; charset=utf-8'                                   // 645
    };                                                                              // 646
    if (shuttingDown)                                                               // 647
      headers['Connection'] = 'Close';                                              // 648
                                                                                    // 649
    var request = WebApp.categorizeRequest(req);                                    // 650
                                                                                    // 651
    if (request.url.query && request.url.query['meteor_css_resource']) {            // 652
      // In this case, we're requesting a CSS resource in the meteor-specific       // 653
      // way, but we don't have it.  Serve a static css file that indicates that    // 654
      // we didn't have it, so we can detect that and refresh.                      // 655
      headers['Content-Type'] = 'text/css; charset=utf-8';                          // 656
      res.writeHead(200, headers);                                                  // 657
      res.write(".meteor-css-not-found-error { width: 0px;}");                      // 658
      res.end();                                                                    // 659
      return undefined;                                                             // 660
    }                                                                               // 661
                                                                                    // 662
    // /packages/asdfsad ... /__cordova/dafsdf.js                                   // 663
    var pathname = connect.utils.parseUrl(req).pathname;                            // 664
    var archKey = pathname.split('/')[1];                                           // 665
    var archKeyCleaned = 'web.' + archKey.replace(/^__/, '');                       // 666
                                                                                    // 667
    if (! /^__/.test(archKey) || ! _.has(archPath, archKeyCleaned)) {               // 668
      archKey = WebApp.defaultArch;                                                 // 669
    } else {                                                                        // 670
      archKey = archKeyCleaned;                                                     // 671
    }                                                                               // 672
                                                                                    // 673
    var boilerplate;                                                                // 674
    try {                                                                           // 675
      boilerplate = getBoilerplate(request, archKey);                               // 676
    } catch (e) {                                                                   // 677
      Log.error("Error running template: " + e);                                    // 678
      res.writeHead(500, headers);                                                  // 679
      res.end();                                                                    // 680
      return undefined;                                                             // 681
    }                                                                               // 682
                                                                                    // 683
    res.writeHead(200, headers);                                                    // 684
    res.write(boilerplate);                                                         // 685
    res.end();                                                                      // 686
    return undefined;                                                               // 687
  });                                                                               // 688
                                                                                    // 689
  // Return 404 by default, if no other handlers serve this URL.                    // 690
  app.use(function (req, res) {                                                     // 691
    res.writeHead(404);                                                             // 692
    res.end();                                                                      // 693
  });                                                                               // 694
                                                                                    // 695
                                                                                    // 696
  var httpServer = http.createServer(app);                                          // 697
  var onListeningCallbacks = [];                                                    // 698
                                                                                    // 699
  // After 5 seconds w/o data on a socket, kill it.  On the other hand, if          // 700
  // there's an outstanding request, give it a higher timeout instead (to avoid     // 701
  // killing long-polling requests)                                                 // 702
  httpServer.setTimeout(SHORT_SOCKET_TIMEOUT);                                      // 703
                                                                                    // 704
  // Do this here, and then also in livedata/stream_server.js, because              // 705
  // stream_server.js kills all the current request handlers when installing its    // 706
  // own.                                                                           // 707
  httpServer.on('request', WebApp._timeoutAdjustmentRequestCallback);               // 708
                                                                                    // 709
                                                                                    // 710
  // start up app                                                                   // 711
  _.extend(WebApp, {                                                                // 712
    connectHandlers: packageAndAppHandlers,                                         // 713
    rawConnectHandlers: rawConnectHandlers,                                         // 714
    httpServer: httpServer,                                                         // 715
    // For testing.                                                                 // 716
    suppressConnectErrors: function () {                                            // 717
      suppressConnectErrors = true;                                                 // 718
    },                                                                              // 719
    onListening: function (f) {                                                     // 720
      if (onListeningCallbacks)                                                     // 721
        onListeningCallbacks.push(f);                                               // 722
      else                                                                          // 723
        f();                                                                        // 724
    },                                                                              // 725
    // Hack: allow http tests to call connect.basicAuth without making them         // 726
    // Npm.depends on another copy of connect. (That would be fine if we could      // 727
    // have test-only NPM dependencies but is overkill here.)                       // 728
    __basicAuth__: connect.basicAuth                                                // 729
  });                                                                               // 730
                                                                                    // 731
  // Let the rest of the packages (and Meteor.startup hooks) insert connect         // 732
  // middlewares and update __meteor_runtime_config__, then keep going to set up    // 733
  // actually serving HTML.                                                         // 734
  main = function (argv) {                                                          // 735
    WebAppInternals.generateBoilerplate();                                          // 736
                                                                                    // 737
    // only start listening after all the startup code has run.                     // 738
    var localPort = parseInt(process.env.PORT) || 0;                                // 739
    var host = process.env.BIND_IP;                                                 // 740
    var localIp = host || '0.0.0.0';                                                // 741
    httpServer.listen(localPort, localIp, Meteor.bindEnvironment(function() {       // 742
      if (process.env.METEOR_PRINT_ON_LISTEN)                                       // 743
        console.log("LISTENING"); // must match run-app.js                          // 744
                                                                                    // 745
      var callbacks = onListeningCallbacks;                                         // 746
      onListeningCallbacks = null;                                                  // 747
      _.each(callbacks, function (x) { x(); });                                     // 748
                                                                                    // 749
    }, function (e) {                                                               // 750
      console.error("Error listening:", e);                                         // 751
      console.error(e && e.stack);                                                  // 752
    }));                                                                            // 753
                                                                                    // 754
    return 'DAEMON';                                                                // 755
  };                                                                                // 756
};                                                                                  // 757
                                                                                    // 758
                                                                                    // 759
runWebAppServer();                                                                  // 760
                                                                                    // 761
                                                                                    // 762
var inlineScriptsAllowed = true;                                                    // 763
                                                                                    // 764
WebAppInternals.inlineScriptsAllowed = function () {                                // 765
  return inlineScriptsAllowed;                                                      // 766
};                                                                                  // 767
                                                                                    // 768
WebAppInternals.setInlineScriptsAllowed = function (value) {                        // 769
  inlineScriptsAllowed = value;                                                     // 770
  WebAppInternals.generateBoilerplate();                                            // 771
};                                                                                  // 772
                                                                                    // 773
WebAppInternals.setBundledJsCssPrefix = function (prefix) {                         // 774
  bundledJsCssPrefix = prefix;                                                      // 775
  WebAppInternals.generateBoilerplate();                                            // 776
};                                                                                  // 777
                                                                                    // 778
// Packages can call `WebAppInternals.addStaticJs` to specify static                // 779
// JavaScript to be included in the app. This static JS will be inlined,            // 780
// unless inline scripts have been disabled, in which case it will be               // 781
// served under `/<sha1 of contents>`.                                              // 782
var additionalStaticJs = {};                                                        // 783
WebAppInternals.addStaticJs = function (contents) {                                 // 784
  additionalStaticJs["/" + sha1(contents) + ".js"] = contents;                      // 785
};                                                                                  // 786
                                                                                    // 787
// Exported for tests                                                               // 788
WebAppInternals.getBoilerplate = getBoilerplate;                                    // 789
WebAppInternals.additionalStaticJs = additionalStaticJs;                            // 790
                                                                                    // 791
//////////////////////////////////////////////////////////////////////////////////////

}).call(this);
