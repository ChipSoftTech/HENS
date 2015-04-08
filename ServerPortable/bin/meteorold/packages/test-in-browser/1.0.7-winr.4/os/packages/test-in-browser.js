(function () {

/////////////////////////////////////////////////////////////////////////
//                                                                     //
// packages/test-in-browser/autoupdate.js                              //
//                                                                     //
/////////////////////////////////////////////////////////////////////////
                                                                       //
// autoupdate normally won't reload on server-only changes, but when   // 1
// running tests in the browser it's nice to have server changes cause // 2
// the tests to reload.  Setting the auto update version to a          // 3
// different value when the server restarts accomplishes this.         // 4
                                                                       // 5
if (Package.autoupdate)                                                // 6
  Package.autoupdate.Autoupdate.autoupdateVersion = Random.id();       // 7
                                                                       // 8
/////////////////////////////////////////////////////////////////////////

}).call(this);
