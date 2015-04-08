(function () {

(function () {

///////////////////////////////////////////////////////////////////////////////////////
//                                                                                   //
// plugin/compile-less.js                                                            //
//                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////
                                                                                     //
var fs = Npm.require('fs');                                                          // 1
var path = Npm.require('path');                                                      // 2
var less = Npm.require('less');                                                      // 3
var Future = Npm.require('fibers/future');                                           // 4
                                                                                     // 5
Plugin.registerSourceHandler("less", {archMatching: 'web'}, function (compileStep) { // 6
  var source = compileStep.read().toString('utf8');                                  // 7
  var options = {                                                                    // 8
    filename: compileStep.inputPath,                                                 // 9
    // Use fs.readFileSync to process @imports. This is the bundler, so              // 10
    // that's not going to cause concurrency issues, and it means that (a)           // 11
    // we don't have to use Futures and (b) errors thrown by bugs in less            // 12
    // actually get caught.                                                          // 13
    syncImport: true,                                                                // 14
    paths: [path.dirname(compileStep._fullInputPath)] // for @import                 // 15
  };                                                                                 // 16
                                                                                     // 17
  var parser = new less.Parser(options);                                             // 18
  var astFuture = new Future;                                                        // 19
  var sourceMap = null;                                                              // 20
  try {                                                                              // 21
    parser.parse(source, astFuture.resolver());                                      // 22
    var ast = astFuture.wait();                                                      // 23
                                                                                     // 24
    var css = ast.toCSS({                                                            // 25
      sourceMap: true,                                                               // 26
      writeSourceMap: function (sm) {                                                // 27
        sourceMap = JSON.parse(sm);                                                  // 28
      }                                                                              // 29
    });                                                                              // 30
  } catch (e) {                                                                      // 31
    // less.Parser.parse is supposed to report any errors via its                    // 32
    // callback. But sometimes, it throws them instead. This is                      // 33
    // probably a bug in less. Be prepared for either behavior.                      // 34
    compileStep.error({                                                              // 35
      message: "Less compiler error: " + e.message,                                  // 36
      sourcePath: e.filename || compileStep.inputPath,                               // 37
      line: e.line,                                                                  // 38
      column: e.column + 1                                                           // 39
    });                                                                              // 40
    return;                                                                          // 41
  }                                                                                  // 42
                                                                                     // 43
                                                                                     // 44
  if (sourceMap) {                                                                   // 45
    sourceMap.sources = [compileStep.inputPath];                                     // 46
    sourceMap.sourcesContent = [source];                                             // 47
    sourceMap = JSON.stringify(sourceMap);                                           // 48
  }                                                                                  // 49
                                                                                     // 50
  compileStep.addStylesheet({                                                        // 51
    path: compileStep.inputPath + ".css",                                            // 52
    data: css,                                                                       // 53
    sourceMap: sourceMap                                                             // 54
  });                                                                                // 55
});;                                                                                 // 56
                                                                                     // 57
// Register import.less files with the dependency watcher, without actually          // 58
// processing them. There is a similar rule in the stylus package.                   // 59
Plugin.registerSourceHandler("import.less", function () {                            // 60
  // Do nothing                                                                      // 61
});                                                                                  // 62
                                                                                     // 63
// Backward compatibility with Meteor 0.7                                            // 64
Plugin.registerSourceHandler("lessimport", function () {});                          // 65
                                                                                     // 66
///////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.compileLess = {};

})();

//# sourceMappingURL=compileLess_plugin.js.map
