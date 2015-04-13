(function () {

(function () {

//////////////////////////////////////////////////////////////////////////////////////
//                                                                                  //
// plugin/basic-file-types.js                                                       //
//                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////
                                                                                    //
/* "js" handler is now hardcoded in packages.js.. necessarily, because              // 1
   we can't exactly define the *.js source file handler in a *.js                   // 2
   source file. */                                                                  // 3
                                                                                    // 4
Plugin.registerSourceHandler("css", {archMatching: 'web'}, function (compileStep) { // 5
  compileStep.addStylesheet({                                                       // 6
    data: compileStep.read().toString('utf8'),                                      // 7
    path: compileStep.inputPath                                                     // 8
  });                                                                               // 9
});                                                                                 // 10
                                                                                    // 11
//////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.basicFileTypes = {};

})();

//# sourceMappingURL=basicFileTypes_plugin.js.map
