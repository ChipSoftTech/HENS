(function () {

///////////////////////////////////////////////////////////////////////
//                                                                   //
// packages/mobile-status-bar/mobile-status-bar.js                   //
//                                                                   //
///////////////////////////////////////////////////////////////////////
                                                                     //
if (window.StatusBar) {                                              // 1
  window.StatusBar.overlaysWebView(false);                           // 2
  window.StatusBar.show();                                           // 3
  window.StatusBar.styleDefault();                                   // 4
  window.StatusBar.backgroundColorByName('white');                   // 5
}                                                                    // 6
                                                                     // 7
                                                                     // 8
///////////////////////////////////////////////////////////////////////

}).call(this);
