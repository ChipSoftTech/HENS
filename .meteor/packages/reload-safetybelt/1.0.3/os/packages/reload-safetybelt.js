(function () {

///////////////////////////////////////////////////////////////////////////////////
//                                                                               //
// packages/reload-safetybelt/reload-safety-belt.js                              //
//                                                                               //
///////////////////////////////////////////////////////////////////////////////////
                                                                                 //
// The reload safetybelt is some js that will be loaded after everything else in // 1
// the HTML.  In some multi-server deployments, when you update, you have a      // 2
// chance of hitting an old server for the HTML and the new server for the JS or // 3
// CSS.  This prevents you from displaying the page in that case, and instead    // 4
// reloads it, presumably all on the new version now.                            // 5
WebAppInternals.addStaticJs(Assets.getText("safetybelt.js"));                    // 6
                                                                                 // 7
///////////////////////////////////////////////////////////////////////////////////

}).call(this);
