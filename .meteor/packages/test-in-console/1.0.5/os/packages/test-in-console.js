(function () {

///////////////////////////////////////////////////////////////////////////////
//                                                                           //
// packages/test-in-console/reporter.js                                      //
//                                                                           //
///////////////////////////////////////////////////////////////////////////////
                                                                             //
// A hacky way to extract the phantom runner script from the package.        // 1
if (process.env.WRITE_RUNNER_JS) {                                           // 2
  Npm.require('fs').writeFileSync(                                           // 3
    process.env.WRITE_RUNNER_JS, new Buffer(Assets.getBinary('runner.js'))); // 4
}                                                                            // 5
                                                                             // 6
var url =  null;                                                             // 7
if (Meteor.settings &&                                                       // 8
    Meteor.settings.public &&                                                // 9
    Meteor.settings.public.runId &&                                          // 10
    Meteor.settings.public.reportTo) {                                       // 11
  url = Meteor.settings.public.reportTo +                                    // 12
      "/report/" +                                                           // 13
      Meteor.settings.public.runId;                                          // 14
}                                                                            // 15
                                                                             // 16
Meteor.methods({                                                             // 17
  report: function (reports) {                                               // 18
    // XXX Could do a more precise validation here; reports are complex!     // 19
    check(reports, [Object]);                                                // 20
    if (url) {                                                               // 21
      HTTP.post(url, {                                                       // 22
        data: reports                                                        // 23
      });                                                                    // 24
    }                                                                        // 25
    return null;                                                             // 26
  }                                                                          // 27
});                                                                          // 28
                                                                             // 29
// provide some notification we're started. This is to allow use             // 30
// in automated scripts with `meteor run --once` which does not              // 31
// print when the proxy is listening.                                        // 32
Meteor.startup(function () {                                                 // 33
  Meteor._debug("test-in-console listening");                                // 34
});                                                                          // 35
                                                                             // 36
///////////////////////////////////////////////////////////////////////////////

}).call(this);
