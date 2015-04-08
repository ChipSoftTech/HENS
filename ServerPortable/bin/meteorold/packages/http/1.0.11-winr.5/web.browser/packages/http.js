(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/http/httpcall_common.js                                                                                   //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
makeErrorByStatus = function(statusCode, content) {                                                                   // 1
  var MAX_LENGTH = 500; // if you change this, also change the appropriate test                                       // 2
                                                                                                                      // 3
  var truncate = function(str, length) {                                                                              // 4
    return str.length > length ? str.slice(0, length) + '...' : str;                                                  // 5
  };                                                                                                                  // 6
                                                                                                                      // 7
  var message = "failed [" + statusCode + "]";                                                                        // 8
  if (content)                                                                                                        // 9
    message += " " + truncate(content.replace(/\n/g, " "), MAX_LENGTH);                                               // 10
                                                                                                                      // 11
  return new Error(message);                                                                                          // 12
};                                                                                                                    // 13
                                                                                                                      // 14
                                                                                                                      // 15
// Fill in `response.data` if the content-type is JSON.                                                               // 16
populateData = function(response) {                                                                                   // 17
  // Read Content-Type header, up to a ';' if there is one.                                                           // 18
  // A typical header might be "application/json; charset=utf-8"                                                      // 19
  // or just "application/json".                                                                                      // 20
  var contentType = (response.headers['content-type'] || ';').split(';')[0];                                          // 21
                                                                                                                      // 22
  // Only try to parse data as JSON if server sets correct content type.                                              // 23
  if (_.include(['application/json', 'text/javascript'], contentType)) {                                              // 24
    try {                                                                                                             // 25
      response.data = JSON.parse(response.content);                                                                   // 26
    } catch (err) {                                                                                                   // 27
      response.data = null;                                                                                           // 28
    }                                                                                                                 // 29
  } else {                                                                                                            // 30
    response.data = null;                                                                                             // 31
  }                                                                                                                   // 32
};                                                                                                                    // 33
                                                                                                                      // 34
HTTP = {};                                                                                                            // 35
                                                                                                                      // 36
/**                                                                                                                   // 37
 * @summary Send an HTTP `GET` request. Equivalent to calling [`HTTP.call`](#http_call) with "GET" as the first argument.
 * @param {String} url The URL to which the request should be sent.                                                   // 39
 * @param {Object} [callOptions] Options passed on to [`HTTP.call`](#http_call).                                      // 40
 * @param {Function} [asyncCallback] Callback that is called when the request is completed. Required on the client.   // 41
 * @locus Anywhere                                                                                                    // 42
 */                                                                                                                   // 43
HTTP.get = function (/* varargs */) {                                                                                 // 44
  return HTTP.call.apply(this, ["GET"].concat(_.toArray(arguments)));                                                 // 45
};                                                                                                                    // 46
                                                                                                                      // 47
/**                                                                                                                   // 48
 * @summary Send an HTTP `POST` request. Equivalent to calling [`HTTP.call`](#http_call) with "POST" as the first argument.
 * @param {String} url The URL to which the request should be sent.                                                   // 50
 * @param {Object} [callOptions] Options passed on to [`HTTP.call`](#http_call).                                      // 51
 * @param {Function} [asyncCallback] Callback that is called when the request is completed. Required on the client.   // 52
 * @locus Anywhere                                                                                                    // 53
 */                                                                                                                   // 54
HTTP.post = function (/* varargs */) {                                                                                // 55
  return HTTP.call.apply(this, ["POST"].concat(_.toArray(arguments)));                                                // 56
};                                                                                                                    // 57
                                                                                                                      // 58
/**                                                                                                                   // 59
 * @summary Send an HTTP `PUT` request. Equivalent to calling [`HTTP.call`](#http_call) with "PUT" as the first argument.
 * @param {String} url The URL to which the request should be sent.                                                   // 61
 * @param {Object} [callOptions] Options passed on to [`HTTP.call`](#http_call).                                      // 62
 * @param {Function} [asyncCallback] Callback that is called when the request is completed. Required on the client.   // 63
 * @locus Anywhere                                                                                                    // 64
 */                                                                                                                   // 65
HTTP.put = function (/* varargs */) {                                                                                 // 66
  return HTTP.call.apply(this, ["PUT"].concat(_.toArray(arguments)));                                                 // 67
};                                                                                                                    // 68
                                                                                                                      // 69
/**                                                                                                                   // 70
 * @summary Send an HTTP `DELETE` request. Equivalent to calling [`HTTP.call`](#http_call) with "DELETE" as the first argument. (Named `del` to avoid conflic with the Javascript keyword `delete`)
 * @param {String} url The URL to which the request should be sent.                                                   // 72
 * @param {Object} [callOptions] Options passed on to [`HTTP.call`](#http_call).                                      // 73
 * @param {Function} [asyncCallback] Callback that is called when the request is completed. Required on the client.   // 74
 * @locus Anywhere                                                                                                    // 75
 */                                                                                                                   // 76
HTTP.del = function (/* varargs */) {                                                                                 // 77
  return HTTP.call.apply(this, ["DELETE"].concat(_.toArray(arguments)));                                              // 78
};                                                                                                                    // 79
                                                                                                                      // 80
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/http/httpcall_client.js                                                                                   //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
/**                                                                                                                   // 1
 * @summary Perform an outbound HTTP request.                                                                         // 2
 * @locus Anywhere                                                                                                    // 3
 * @param {String} method The [HTTP method](http://en.wikipedia.org/wiki/HTTP_method) to use, such as "`GET`", "`POST`", or "`HEAD`".
 * @param {String} url The URL to retrieve.                                                                           // 5
 * @param {Object} [options]                                                                                          // 6
 * @param {String} options.content String to use as the HTTP request body.                                            // 7
 * @param {Object} options.data JSON-able object to stringify and use as the HTTP request body. Overwrites `content`. // 8
 * @param {String} options.query Query string to go in the URL. Overwrites any query string in `url`.                 // 9
 * @param {Object} options.params Dictionary of request parameters to be encoded and placed in the URL (for GETs) or request body (for POSTs).  If `content` or `data` is specified, `params` will always be placed in the URL.
 * @param {String} options.auth HTTP basic authentication string of the form `"username:password"`                    // 11
 * @param {Object} options.headers Dictionary of strings, headers to add to the HTTP request.                         // 12
 * @param {Number} options.timeout Maximum time in milliseconds to wait for the request before failing.  There is no timeout by default.
 * @param {Boolean} options.followRedirects If `true`, transparently follow HTTP redirects. Cannot be set to `false` on the client. Default `true`.
 * @param {Function} [asyncCallback] Optional callback.  If passed, the method runs asynchronously, instead of synchronously, and calls asyncCallback.  On the client, this callback is required.
 */                                                                                                                   // 16
HTTP.call = function(method, url, options, callback) {                                                                // 17
                                                                                                                      // 18
  ////////// Process arguments //////////                                                                             // 19
                                                                                                                      // 20
  if (! callback && typeof options === "function") {                                                                  // 21
    // support (method, url, callback) argument list                                                                  // 22
    callback = options;                                                                                               // 23
    options = null;                                                                                                   // 24
  }                                                                                                                   // 25
                                                                                                                      // 26
  options = options || {};                                                                                            // 27
                                                                                                                      // 28
  if (typeof callback !== "function")                                                                                 // 29
    throw new Error(                                                                                                  // 30
      "Can't make a blocking HTTP call from the client; callback required.");                                         // 31
                                                                                                                      // 32
  method = (method || "").toUpperCase();                                                                              // 33
                                                                                                                      // 34
  var headers = {};                                                                                                   // 35
                                                                                                                      // 36
  var content = options.content;                                                                                      // 37
  if (options.data) {                                                                                                 // 38
    content = JSON.stringify(options.data);                                                                           // 39
    headers['Content-Type'] = 'application/json';                                                                     // 40
  }                                                                                                                   // 41
                                                                                                                      // 42
  var params_for_url, params_for_body;                                                                                // 43
  if (content || method === "GET" || method === "HEAD")                                                               // 44
    params_for_url = options.params;                                                                                  // 45
  else                                                                                                                // 46
    params_for_body = options.params;                                                                                 // 47
                                                                                                                      // 48
  url = URL._constructUrl(url, options.query, params_for_url);                                                        // 49
                                                                                                                      // 50
  if (options.followRedirects === false)                                                                              // 51
    throw new Error("Option followRedirects:false not supported on client.");                                         // 52
                                                                                                                      // 53
  var username, password;                                                                                             // 54
  if (options.auth) {                                                                                                 // 55
    var colonLoc = options.auth.indexOf(':');                                                                         // 56
    if (colonLoc < 0)                                                                                                 // 57
      throw new Error('auth option should be of the form "username:password"');                                       // 58
    username = options.auth.substring(0, colonLoc);                                                                   // 59
    password = options.auth.substring(colonLoc+1);                                                                    // 60
  }                                                                                                                   // 61
                                                                                                                      // 62
  if (params_for_body) {                                                                                              // 63
    content = URL._encodeParams(params_for_body);                                                                     // 64
  }                                                                                                                   // 65
                                                                                                                      // 66
  _.extend(headers, options.headers || {});                                                                           // 67
                                                                                                                      // 68
  ////////// Callback wrapping //////////                                                                             // 69
                                                                                                                      // 70
  // wrap callback to add a 'response' property on an error, in case                                                  // 71
  // we have both (http 4xx/5xx error, which has a response payload)                                                  // 72
  callback = (function(callback) {                                                                                    // 73
    return function(error, response) {                                                                                // 74
      if (error && response)                                                                                          // 75
        error.response = response;                                                                                    // 76
      callback(error, response);                                                                                      // 77
    };                                                                                                                // 78
  })(callback);                                                                                                       // 79
                                                                                                                      // 80
  // safety belt: only call the callback once.                                                                        // 81
  callback = _.once(callback);                                                                                        // 82
                                                                                                                      // 83
                                                                                                                      // 84
  ////////// Kickoff! //////////                                                                                      // 85
                                                                                                                      // 86
  // from this point on, errors are because of something remote, not                                                  // 87
  // something we should check in advance. Turn exceptions into error                                                 // 88
  // results.                                                                                                         // 89
  try {                                                                                                               // 90
    // setup XHR object                                                                                               // 91
    var xhr;                                                                                                          // 92
    if (typeof XMLHttpRequest !== "undefined")                                                                        // 93
      xhr = new XMLHttpRequest();                                                                                     // 94
    else if (typeof ActiveXObject !== "undefined")                                                                    // 95
      xhr = new ActiveXObject("Microsoft.XMLHttp"); // IE6                                                            // 96
    else                                                                                                              // 97
      throw new Error("Can't create XMLHttpRequest"); // ???                                                          // 98
                                                                                                                      // 99
    xhr.open(method, url, true, username, password);                                                                  // 100
                                                                                                                      // 101
    for (var k in headers)                                                                                            // 102
      xhr.setRequestHeader(k, headers[k]);                                                                            // 103
                                                                                                                      // 104
                                                                                                                      // 105
    // setup timeout                                                                                                  // 106
    var timed_out = false;                                                                                            // 107
    var timer;                                                                                                        // 108
    if (options.timeout) {                                                                                            // 109
      timer = Meteor.setTimeout(function() {                                                                          // 110
        timed_out = true;                                                                                             // 111
        xhr.abort();                                                                                                  // 112
      }, options.timeout);                                                                                            // 113
    };                                                                                                                // 114
                                                                                                                      // 115
    // callback on complete                                                                                           // 116
    xhr.onreadystatechange = function(evt) {                                                                          // 117
      if (xhr.readyState === 4) { // COMPLETE                                                                         // 118
        if (timer)                                                                                                    // 119
          Meteor.clearTimeout(timer);                                                                                 // 120
                                                                                                                      // 121
        if (timed_out) {                                                                                              // 122
          callback(new Error("timeout"));                                                                             // 123
        } else if (! xhr.status) {                                                                                    // 124
          // no HTTP response                                                                                         // 125
          callback(new Error("network"));                                                                             // 126
        } else {                                                                                                      // 127
                                                                                                                      // 128
          var response = {};                                                                                          // 129
          response.statusCode = xhr.status;                                                                           // 130
          response.content = xhr.responseText;                                                                        // 131
                                                                                                                      // 132
          response.headers = {};                                                                                      // 133
          var header_str = xhr.getAllResponseHeaders();                                                               // 134
                                                                                                                      // 135
          // https://github.com/meteor/meteor/issues/553                                                              // 136
          //                                                                                                          // 137
          // In Firefox there is a weird issue, sometimes                                                             // 138
          // getAllResponseHeaders returns the empty string, but                                                      // 139
          // getResponseHeader returns correct results. Possibly this                                                 // 140
          // issue:                                                                                                   // 141
          // https://bugzilla.mozilla.org/show_bug.cgi?id=608735                                                      // 142
          //                                                                                                          // 143
          // If this happens we can't get a full list of headers, but                                                 // 144
          // at least get content-type so our JSON decoding happens                                                   // 145
          // correctly. In theory, we could try and rescue more header                                                // 146
          // values with a list of common headers, but content-type is                                                // 147
          // the only vital one for now.                                                                              // 148
          if ("" === header_str && xhr.getResponseHeader("content-type"))                                             // 149
            header_str =                                                                                              // 150
            "content-type: " + xhr.getResponseHeader("content-type");                                                 // 151
                                                                                                                      // 152
          var headers_raw = header_str.split(/\r?\n/);                                                                // 153
          _.each(headers_raw, function (h) {                                                                          // 154
            var m = /^(.*?):(?:\s+)(.*)$/.exec(h);                                                                    // 155
            if (m && m.length === 3)                                                                                  // 156
              response.headers[m[1].toLowerCase()] = m[2];                                                            // 157
          });                                                                                                         // 158
                                                                                                                      // 159
          populateData(response);                                                                                     // 160
                                                                                                                      // 161
          var error = null;                                                                                           // 162
          if (response.statusCode >= 400)                                                                             // 163
            error = makeErrorByStatus(response.statusCode, response.content);                                         // 164
                                                                                                                      // 165
          callback(error, response);                                                                                  // 166
        }                                                                                                             // 167
      }                                                                                                               // 168
    };                                                                                                                // 169
                                                                                                                      // 170
    // send it on its way                                                                                             // 171
    xhr.send(content);                                                                                                // 172
                                                                                                                      // 173
  } catch (err) {                                                                                                     // 174
    callback(err);                                                                                                    // 175
  }                                                                                                                   // 176
                                                                                                                      // 177
};                                                                                                                    // 178
                                                                                                                      // 179
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/http/deprecated.js                                                                                        //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
// The HTTP object used to be called Meteor.http.                                                                     // 1
// XXX COMPAT WITH 0.6.4                                                                                              // 2
Meteor.http = HTTP;                                                                                                   // 3
                                                                                                                      // 4
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
