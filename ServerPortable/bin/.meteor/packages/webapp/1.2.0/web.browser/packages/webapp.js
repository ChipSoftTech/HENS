(function () {

///////////////////////////////////////////////////////////////////////
//                                                                   //
// packages/webapp/webapp_client.js                                  //
//                                                                   //
///////////////////////////////////////////////////////////////////////
                                                                     //
WebApp = {                                                           // 1
                                                                     // 2
  _isCssLoaded: function () {                                        // 3
    if (document.styleSheets.length === 0)                           // 4
      return true;                                                   // 5
                                                                     // 6
    return _.find(document.styleSheets, function (sheet) {           // 7
      if (sheet.cssText && !sheet.cssRules) // IE8                   // 8
        return !sheet.cssText.match(/meteor-css-not-found-error/);   // 9
      return !_.find(sheet.cssRules, function (rule) {               // 10
        return rule.selectorText === '.meteor-css-not-found-error';  // 11
      });                                                            // 12
    });                                                              // 13
  }                                                                  // 14
};                                                                   // 15
                                                                     // 16
///////////////////////////////////////////////////////////////////////

}).call(this);
