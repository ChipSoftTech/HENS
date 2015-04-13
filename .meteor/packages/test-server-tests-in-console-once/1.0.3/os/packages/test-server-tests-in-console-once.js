(function () {

///////////////////////////////////////////////////////////////////////////////
//                                                                           //
// packages/test-server-tests-in-console-once/server.js                      //
//                                                                           //
///////////////////////////////////////////////////////////////////////////////
                                                                             //
var passed = 0;                                                              // 1
var failed = 0;                                                              // 2
var expected = 0;                                                            // 3
var resultSet = {};                                                          // 4
                                                                             // 5
var getName = function (result) {                                            // 6
  return result.groupPath.join(" - ") + " - " + result.test;                 // 7
};                                                                           // 8
                                                                             // 9
Meteor.startup(function () {                                                 // 10
  console.log("running server-side tests");                                  // 11
  Tinytest._runTests(function (results) {                                    // 12
    var name = getName(results);                                             // 13
    if (!_.has(resultSet, name)) {                                           // 14
      var testPath = EJSON.clone(results.groupPath);                         // 15
      testPath.push(results.test);                                           // 16
      resultSet[name] = {                                                    // 17
        name: name,                                                          // 18
        status: "PENDING",                                                   // 19
        events: [],                                                          // 20
        testPath: testPath                                                   // 21
      };                                                                     // 22
    }                                                                        // 23
    _.each(results.events, function (event) {                                // 24
      resultSet[name].events.push(event);                                    // 25
      switch (event.type) {                                                  // 26
      case "ok":                                                             // 27
        break;                                                               // 28
      case "expected_fail":                                                  // 29
        if (resultSet[name].status !== "FAIL")                               // 30
          resultSet[name].status = "EXPECTED";                               // 31
        break;                                                               // 32
      case "exception":                                                      // 33
        console.log(name, ":", "!!!!!!!!! FAIL !!!!!!!!!!!");                // 34
        if (event.details && event.details.stack)                            // 35
          console.log(event.details.stack);                                  // 36
        else                                                                 // 37
          console.log("Test failed with exception");                         // 38
        failed++;                                                            // 39
        break;                                                               // 40
      case "finish":                                                         // 41
        switch (resultSet[name].status) {                                    // 42
        case "OK":                                                           // 43
          break;                                                             // 44
        case "PENDING":                                                      // 45
          resultSet[name].status = "OK";                                     // 46
          console.log(name, ":", "OK");                                      // 47
          passed++;                                                          // 48
          break;                                                             // 49
        case "EXPECTED":                                                     // 50
          console.log(name, ":", "EXPECTED FAILURE");                        // 51
          expected++;                                                        // 52
          break;                                                             // 53
        case "FAIL":                                                         // 54
          failed++;                                                          // 55
          console.log(name, ":", "!!!!!!!!! FAIL !!!!!!!!!!!");              // 56
          console.log(JSON.stringify(resultSet[name].info));                 // 57
          break;                                                             // 58
        default:                                                             // 59
          console.log(name, ": unknown state for the test to be in");        // 60
        }                                                                    // 61
        break;                                                               // 62
      default:                                                               // 63
        resultSet[name].status = "FAIL";                                     // 64
        resultSet[name].info = results;                                      // 65
        break;                                                               // 66
      }                                                                      // 67
    });                                                                      // 68
  }, function () {                                                           // 69
    console.log("passed/expected/failed/total",                              // 70
                passed, "/", expected, "/", failed, "/", _.size(resultSet)); // 71
    if (failed > 0) {                                                        // 72
      console.log("TESTS FAILED");                                           // 73
    } else {                                                                 // 74
      console.log("ALL TESTS PASSED");                                       // 75
    }                                                                        // 76
    process.exit(failed ? 1 : 0);                                            // 77
  });                                                                        // 78
});                                                                          // 79
                                                                             // 80
///////////////////////////////////////////////////////////////////////////////

}).call(this);
