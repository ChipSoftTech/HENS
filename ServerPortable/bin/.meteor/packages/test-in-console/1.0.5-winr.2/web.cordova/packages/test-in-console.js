(function () {

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                              //
// packages/test-in-console/driver.js                                                                           //
//                                                                                                              //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                //
// Global flag for phantomjs (or other browser) to eval to see if we're done.                                   // 1
DONE = false;                                                                                                   // 2
// Failure count for phantomjs exit code                                                                        // 3
FAILURES = null;                                                                                                // 4
                                                                                                                // 5
TEST_STATUS = {                                                                                                 // 6
  DONE: false,                                                                                                  // 7
  FAILURES: null                                                                                                // 8
};                                                                                                              // 9
                                                                                                                // 10
// xUnit format uses XML output                                                                                 // 11
var XML_CHAR_MAP = {                                                                                            // 12
  '<': '&lt;',                                                                                                  // 13
  '>': '&gt;',                                                                                                  // 14
  '&': '&amp;',                                                                                                 // 15
  '"': '&quot;',                                                                                                // 16
  "'": '&apos;'                                                                                                 // 17
};                                                                                                              // 18
                                                                                                                // 19
// Escapes a string for insertion into XML                                                                      // 20
var escapeXml = function (s) {                                                                                  // 21
  return s.replace(/[<>&"']/g, function (c) {                                                                   // 22
    return XML_CHAR_MAP[c];                                                                                     // 23
  });                                                                                                           // 24
}                                                                                                               // 25
                                                                                                                // 26
// Returns a human name for a test                                                                              // 27
var getName = function (result) {                                                                               // 28
  return (result.server ? "S: " : "C: ") +                                                                      // 29
    result.groupPath.join(" - ") + " - " + result.test;                                                         // 30
};                                                                                                              // 31
                                                                                                                // 32
// Calls console.log, but returns silently if console.log is not available                                      // 33
var log = function (/*arguments*/) {                                                                            // 34
  if (typeof console !== 'undefined') {                                                                         // 35
    console.log.apply(console, arguments);                                                                      // 36
  }                                                                                                             // 37
};                                                                                                              // 38
                                                                                                                // 39
var MAGIC_PREFIX = '##_meteor_magic##';                                                                         // 40
// Write output so that other tools can read it                                                                 // 41
// Output is sent to console.log, prefixed with the magic prefix and then the facility                          // 42
// By grepping for the prefix, other tools can get the 'special' output                                         // 43
var logMagic = function (facility, s) {                                                                         // 44
  log(MAGIC_PREFIX + facility + ': ' + s);                                                                      // 45
};                                                                                                              // 46
                                                                                                                // 47
// Logs xUnit output, if xunit output is enabled                                                                // 48
// This uses logMagic with a facility of xunit                                                                  // 49
var xunit = function (s) {                                                                                      // 50
  if (xunitEnabled) {                                                                                           // 51
    logMagic('xunit', s);                                                                                       // 52
  }                                                                                                             // 53
};                                                                                                              // 54
                                                                                                                // 55
var passed = 0;                                                                                                 // 56
var failed = 0;                                                                                                 // 57
var expected = 0;                                                                                               // 58
var resultSet = {};                                                                                             // 59
var toReport = [];                                                                                              // 60
                                                                                                                // 61
var hrefPath = document.location.href.split("/");                                                               // 62
var platform = decodeURIComponent(hrefPath.length && hrefPath[hrefPath.length - 1]);                            // 63
if (!platform)                                                                                                  // 64
  platform = "local";                                                                                           // 65
                                                                                                                // 66
// We enable xUnit output when platform is xunit                                                                // 67
var xunitEnabled = (platform == 'xunit');                                                                       // 68
                                                                                                                // 69
var doReport = Meteor &&                                                                                        // 70
      Meteor.settings &&                                                                                        // 71
      Meteor.settings.public &&                                                                                 // 72
      Meteor.settings.public.runId;                                                                             // 73
var report = function (name, last) {                                                                            // 74
  if (doReport) {                                                                                               // 75
    var data = {                                                                                                // 76
      run_id: Meteor.settings.public.runId,                                                                     // 77
      testPath: resultSet[name].testPath,                                                                       // 78
      status: resultSet[name].status,                                                                           // 79
      platform: platform,                                                                                       // 80
      server: resultSet[name].server,                                                                           // 81
      fullName: name.substr(3)                                                                                  // 82
    };                                                                                                          // 83
    if ((data.status === "FAIL" || data.status === "EXPECTED") &&                                               // 84
        !_.isEmpty(resultSet[name].events)) {                                                                   // 85
      // only send events when bad things happen                                                                // 86
      data.events = resultSet[name].events;                                                                     // 87
    }                                                                                                           // 88
    if (last)                                                                                                   // 89
      data.end = new Date();                                                                                    // 90
    else                                                                                                        // 91
      data.start = new Date();                                                                                  // 92
    toReport.push(EJSON.toJSONValue(data));                                                                     // 93
  }                                                                                                             // 94
};                                                                                                              // 95
var sendReports = function (callback) {                                                                         // 96
  var reports = toReport;                                                                                       // 97
  if (!callback)                                                                                                // 98
    callback = function () {};                                                                                  // 99
  toReport = [];                                                                                                // 100
  if (doReport)                                                                                                 // 101
    Meteor.call("report", reports, callback);                                                                   // 102
  else                                                                                                          // 103
    callback();                                                                                                 // 104
};                                                                                                              // 105
Meteor.startup(function () {                                                                                    // 106
  setTimeout(sendReports, 500);                                                                                 // 107
  setInterval(sendReports, 2000);                                                                               // 108
                                                                                                                // 109
  Tinytest._runTestsEverywhere(                                                                                 // 110
    function (results) {                                                                                        // 111
      var name = getName(results);                                                                              // 112
      if (!_.has(resultSet, name)) {                                                                            // 113
        var testPath = EJSON.clone(results.groupPath);                                                          // 114
        testPath.push(results.test);                                                                            // 115
        resultSet[name] = {                                                                                     // 116
          name: name,                                                                                           // 117
          status: "PENDING",                                                                                    // 118
          events: [],                                                                                           // 119
          server: !!results.server,                                                                             // 120
          testPath: testPath,                                                                                   // 121
          test: results.test                                                                                    // 122
        };                                                                                                      // 123
        report(name, false);                                                                                    // 124
      }                                                                                                         // 125
      // Loop through events, and record status for each test                                                   // 126
      // Also log result if test has finished                                                                   // 127
      _.each(results.events, function (event) {                                                                 // 128
        resultSet[name].events.push(event);                                                                     // 129
        switch (event.type) {                                                                                   // 130
        case "ok":                                                                                              // 131
          break;                                                                                                // 132
        case "expected_fail":                                                                                   // 133
          if (resultSet[name].status !== "FAIL")                                                                // 134
            resultSet[name].status = "EXPECTED";                                                                // 135
          break;                                                                                                // 136
        case "exception":                                                                                       // 137
          log(name, ":", "!!!!!!!!! FAIL !!!!!!!!!!!");                                                         // 138
          if (event.details && event.details.stack)                                                             // 139
            log(event.details.stack);                                                                           // 140
          else                                                                                                  // 141
            log("Test failed with exception");                                                                  // 142
          failed++;                                                                                             // 143
          break;                                                                                                // 144
        case "finish":                                                                                          // 145
          switch (resultSet[name].status) {                                                                     // 146
          case "OK":                                                                                            // 147
            break;                                                                                              // 148
          case "PENDING":                                                                                       // 149
            resultSet[name].status = "OK";                                                                      // 150
            report(name, true);                                                                                 // 151
            log(name, ":", "OK");                                                                               // 152
            passed++;                                                                                           // 153
            break;                                                                                              // 154
          case "EXPECTED":                                                                                      // 155
            report(name, true);                                                                                 // 156
            log(name, ":", "EXPECTED FAILURE");                                                                 // 157
            expected++;                                                                                         // 158
            break;                                                                                              // 159
          case "FAIL":                                                                                          // 160
            failed++;                                                                                           // 161
            report(name, true);                                                                                 // 162
            log(name, ":", "!!!!!!!!! FAIL !!!!!!!!!!!");                                                       // 163
            log(JSON.stringify(resultSet[name].info));                                                          // 164
            break;                                                                                              // 165
          default:                                                                                              // 166
            log(name, ": unknown state for the test to be in");                                                 // 167
          }                                                                                                     // 168
          break;                                                                                                // 169
        default:                                                                                                // 170
          resultSet[name].status = "FAIL";                                                                      // 171
          resultSet[name].info = results;                                                                       // 172
          break;                                                                                                // 173
        }                                                                                                       // 174
      });                                                                                                       // 175
    },                                                                                                          // 176
                                                                                                                // 177
    // After test completion, log a quick summary                                                               // 178
    function () {                                                                                               // 179
      if (failed > 0) {                                                                                         // 180
        log("~~~~~~~ THERE ARE FAILURES ~~~~~~~");                                                              // 181
      }                                                                                                         // 182
      log("passed/expected/failed/total", passed, "/", expected, "/", failed, "/", _.size(resultSet));          // 183
      sendReports(function () {                                                                                 // 184
        if (doReport) {                                                                                         // 185
          log("Waiting 3s for any last reports to get sent out");                                               // 186
          setTimeout(function () {                                                                              // 187
            TEST_STATUS.FAILURES = FAILURES = failed;                                                           // 188
            TEST_STATUS.DONE = DONE = true;                                                                     // 189
          }, 3000);                                                                                             // 190
        } else {                                                                                                // 191
          TEST_STATUS.FAILURES = FAILURES = failed;                                                             // 192
          TEST_STATUS.DONE = DONE = true;                                                                       // 193
        }                                                                                                       // 194
      });                                                                                                       // 195
                                                                                                                // 196
      // Also log xUnit output                                                                                  // 197
      xunit('<testsuite errors="" failures="" name="meteor" skips="" tests="" time="">');                       // 198
      _.each(resultSet, function (result, name) {                                                               // 199
        var classname = result.testPath.join('.').replace(/ /g, '-') + (result.server ? "-server" : "-client"); // 200
        var name = result.test.replace(/ /g, '-') + (result.server ? "-server" : "-client");                    // 201
        var time = "";                                                                                          // 202
        var error = "";                                                                                         // 203
        _.each(result.events, function (event) {                                                                // 204
          switch (event.type) {                                                                                 // 205
            case "finish":                                                                                      // 206
              var timeMs = event.timeMs;                                                                        // 207
              if (timeMs !== undefined) {                                                                       // 208
                time = (timeMs / 1000) + "";                                                                    // 209
              }                                                                                                 // 210
              break;                                                                                            // 211
            case "exception":                                                                                   // 212
              var details = event.details || {};                                                                // 213
              error = (details.message || '?') + " filename=" + (details.filename || '?') + " line=" + (details.line || '?');
              break;                                                                                            // 215
          }                                                                                                     // 216
        });                                                                                                     // 217
        switch (result.status) {                                                                                // 218
          case "FAIL":                                                                                          // 219
            error = error || '?';                                                                               // 220
            break;                                                                                              // 221
          case "EXPECTED":                                                                                      // 222
            error = null;                                                                                       // 223
            break;                                                                                              // 224
        }                                                                                                       // 225
                                                                                                                // 226
        xunit('<testcase classname="' + escapeXml(classname) + '" name="' + escapeXml(name) + '" time="' + time + '">');
        if (error) {                                                                                            // 228
          xunit('  <failure message="test failure">' + escapeXml(error) + '</failure>');                        // 229
        }                                                                                                       // 230
        xunit('</testcase>');                                                                                   // 231
      });                                                                                                       // 232
      xunit('</testsuite>');                                                                                    // 233
      logMagic('state', 'done');                                                                                // 234
    },                                                                                                          // 235
    ["tinytest"]);                                                                                              // 236
});                                                                                                             // 237
                                                                                                                // 238
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
