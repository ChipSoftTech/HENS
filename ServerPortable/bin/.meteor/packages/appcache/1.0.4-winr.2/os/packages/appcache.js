(function () {

/////////////////////////////////////////////////////////////////////////////////////
//                                                                                 //
// packages/appcache/appcache-server.js                                            //
//                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////
                                                                                   //
var crypto = Npm.require('crypto');                                                // 1
var fs = Npm.require('fs');                                                        // 2
var path = Npm.require('path');                                                    // 3
                                                                                   // 4
var _disableSizeCheck = false;                                                     // 5
                                                                                   // 6
Meteor.AppCache = {                                                                // 7
  config: function (options) {                                                     // 8
    _.each(options, function (value, option) {                                     // 9
      if (option === 'browsers') {                                                 // 10
        disabledBrowsers = {};                                                     // 11
        _.each(value, function (browser) {                                         // 12
          disabledBrowsers[browser] = false;                                       // 13
        });                                                                        // 14
      }                                                                            // 15
      else if (option === 'onlineOnly') {                                          // 16
        _.each(value, function (urlPrefix) {                                       // 17
          RoutePolicy.declare(urlPrefix, 'static-online');                         // 18
        });                                                                        // 19
      }                                                                            // 20
      // option to suppress warnings for tests.                                    // 21
      else if (option === '_disableSizeCheck') {                                   // 22
        _disableSizeCheck = value;                                                 // 23
      }                                                                            // 24
      else if (value === false) {                                                  // 25
        disabledBrowsers[option] = true;                                           // 26
      }                                                                            // 27
      else if (value === true) {                                                   // 28
        disabledBrowsers[option] = false;                                          // 29
      } else {                                                                     // 30
        throw new Error('Invalid AppCache config option: ' + option);              // 31
      }                                                                            // 32
    });                                                                            // 33
  }                                                                                // 34
};                                                                                 // 35
                                                                                   // 36
var disabledBrowsers = {};                                                         // 37
var browserDisabled = function (request) {                                         // 38
  return disabledBrowsers[request.browser.name];                                   // 39
};                                                                                 // 40
                                                                                   // 41
WebApp.addHtmlAttributeHook(function (request) {                                   // 42
  if (browserDisabled(request))                                                    // 43
    return null;                                                                   // 44
  else                                                                             // 45
    return { manifest: "/app.manifest" };                                          // 46
});                                                                                // 47
                                                                                   // 48
WebApp.connectHandlers.use(function (req, res, next) {                             // 49
  if (req.url !== '/app.manifest') {                                               // 50
    return next();                                                                 // 51
  }                                                                                // 52
                                                                                   // 53
  // Browsers will get confused if we unconditionally serve the                    // 54
  // manifest and then disable the app cache for that browser.  If                 // 55
  // the app cache had previously been enabled for a browser, it                   // 56
  // will continue to fetch the manifest as long as it's available,                // 57
  // even if we now are not including the manifest attribute in the                // 58
  // app HTML.  (Firefox for example will continue to display "this                // 59
  // website is asking to store data on your computer for offline                  // 60
  // use").  Returning a 404 gets the browser to really turn off the               // 61
  // app cache.                                                                    // 62
                                                                                   // 63
  if (browserDisabled(WebApp.categorizeRequest(req))) {                            // 64
    res.writeHead(404);                                                            // 65
    res.end();                                                                     // 66
    return;                                                                        // 67
  }                                                                                // 68
                                                                                   // 69
  var manifest = "CACHE MANIFEST\n\n";                                             // 70
                                                                                   // 71
  // After the browser has downloaded the app files from the server and            // 72
  // has populated the browser's application cache, the browser will               // 73
  // *only* connect to the server and reload the application if the                // 74
  // *contents* of the app manifest file has changed.                              // 75
  //                                                                               // 76
  // So to ensure that the client updates if client resources change,              // 77
  // include a hash of client resources in the manifest.                           // 78
                                                                                   // 79
  manifest += "# " + WebApp.clientHash() + "\n";                                   // 80
                                                                                   // 81
  // When using the autoupdate package, also include                               // 82
  // AUTOUPDATE_VERSION.  Otherwise the client will get into an                    // 83
  // infinite loop of reloads when the browser doesn't fetch the new               // 84
  // app HTML which contains the new version, and autoupdate will                  // 85
  // reload again trying to get the new code.                                      // 86
                                                                                   // 87
  if (Package.autoupdate) {                                                        // 88
    var version = Package.autoupdate.Autoupdate.autoupdateVersion;                 // 89
    if (version !== WebApp.clientHash())                                           // 90
      manifest += "# " + version + "\n";                                           // 91
  }                                                                                // 92
                                                                                   // 93
  manifest += "\n";                                                                // 94
                                                                                   // 95
  manifest += "CACHE:" + "\n";                                                     // 96
  manifest += "/" + "\n";                                                          // 97
  _.each(WebApp.clientPrograms[WebApp.defaultArch].manifest, function (resource) { // 98
    if (resource.where === 'client' &&                                             // 99
        ! RoutePolicy.classify(resource.url)) {                                    // 100
      manifest += resource.url;                                                    // 101
      // If the resource is not already cacheable (has a query                     // 102
      // parameter, presumably with a hash or version of some sort),               // 103
      // put a version with a hash in the cache.                                   // 104
      //                                                                           // 105
      // Avoid putting a non-cacheable asset into the cache, otherwise             // 106
      // the user can't modify the asset until the cache headers                   // 107
      // expire.                                                                   // 108
      if (!resource.cacheable)                                                     // 109
        manifest += "?" + resource.hash;                                           // 110
                                                                                   // 111
      manifest += "\n";                                                            // 112
    }                                                                              // 113
  });                                                                              // 114
  manifest += "\n";                                                                // 115
                                                                                   // 116
  manifest += "FALLBACK:\n";                                                       // 117
  manifest += "/ /" + "\n";                                                        // 118
  // Add a fallback entry for each uncacheable asset we added above.               // 119
  //                                                                               // 120
  // This means requests for the bare url (/image.png instead of                   // 121
  // /image.png?hash) will work offline. Online, however, the browser              // 122
  // will send a request to the server. Users can remove this extra                // 123
  // request to the server and have the asset served from cache by                 // 124
  // specifying the full URL with hash in their code (manually, with               // 125
  // some sort of URL rewriting helper)                                            // 126
  _.each(WebApp.clientPrograms[WebApp.defaultArch].manifest, function (resource) { // 127
    if (resource.where === 'client' &&                                             // 128
        ! RoutePolicy.classify(resource.url) &&                                    // 129
        !resource.cacheable) {                                                     // 130
      manifest += resource.url + " " + resource.url +                              // 131
        "?" + resource.hash + "\n";                                                // 132
    }                                                                              // 133
  });                                                                              // 134
                                                                                   // 135
  manifest += "\n";                                                                // 136
                                                                                   // 137
  manifest += "NETWORK:\n";                                                        // 138
  // TODO adding the manifest file to NETWORK should be unnecessary?               // 139
  // Want more testing to be sure.                                                 // 140
  manifest += "/app.manifest" + "\n";                                              // 141
  _.each(                                                                          // 142
    [].concat(                                                                     // 143
      RoutePolicy.urlPrefixesFor('network'),                                       // 144
      RoutePolicy.urlPrefixesFor('static-online')                                  // 145
    ),                                                                             // 146
    function (urlPrefix) {                                                         // 147
      manifest += urlPrefix + "\n";                                                // 148
    }                                                                              // 149
  );                                                                               // 150
  manifest += "*" + "\n";                                                          // 151
                                                                                   // 152
  // content length needs to be based on bytes                                     // 153
  var body = new Buffer(manifest);                                                 // 154
                                                                                   // 155
  res.setHeader('Content-Type', 'text/cache-manifest');                            // 156
  res.setHeader('Content-Length', body.length);                                    // 157
  return res.end(body);                                                            // 158
});                                                                                // 159
                                                                                   // 160
var sizeCheck = function () {                                                      // 161
  var totalSize = 0;                                                               // 162
  _.each(WebApp.clientPrograms[WebApp.defaultArch].manifest, function (resource) { // 163
    if (resource.where === 'client' &&                                             // 164
        ! RoutePolicy.classify(resource.url)) {                                    // 165
      totalSize += resource.size;                                                  // 166
    }                                                                              // 167
  });                                                                              // 168
  if (totalSize > 5 * 1024 * 1024) {                                               // 169
    Meteor._debug(                                                                 // 170
      "** You are using the appcache package but the total size of the\n" +        // 171
      "** cached resources is " +                                                  // 172
      (totalSize / 1024 / 1024).toFixed(1) + "MB.\n" +                             // 173
      "**\n" +                                                                     // 174
      "** This is over the recommended maximum of 5 MB and may break your\n" +     // 175
      "** app in some browsers! See http://docs.meteor.com/#appcache\n" +          // 176
      "** for more information and fixes.\n"                                       // 177
    );                                                                             // 178
  }                                                                                // 179
};                                                                                 // 180
                                                                                   // 181
// Run the size check after user code has had a chance to run. That way,           // 182
// the size check can take into account files that the user does not               // 183
// want cached. Otherwise, the size check warning will still print even            // 184
// if the user excludes their large files with                                     // 185
// `Meteor.AppCache.config({onlineOnly: files})`.                                  // 186
Meteor.startup(function () {                                                       // 187
  if (! _disableSizeCheck)                                                         // 188
    sizeCheck();                                                                   // 189
});                                                                                // 190
                                                                                   // 191
/////////////////////////////////////////////////////////////////////////////////////

}).call(this);
