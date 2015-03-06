(function () {

//////////////////////////////////////////////////////////////////////////////////
//                                                                              //
// packages/js-analyze/js_analyze.js                                            //
//                                                                              //
//////////////////////////////////////////////////////////////////////////////////
                                                                                //
var esprima = Npm.require('esprima');                                           // 1
var escope = Npm.require('escope');                                             // 2
                                                                                // 3
JSAnalyze = {};                                                                 // 4
                                                                                // 5
// Like esprima.parse, but annotates any thrown error with $ParseError = true.  // 6
var esprimaParse = function (source) {                                          // 7
  try {                                                                         // 8
    return esprima.parse(source);                                               // 9
  } catch (e) {                                                                 // 10
    if ('index' in e && 'lineNumber' in e &&                                    // 11
        'column' in e && 'description' in e) {                                  // 12
      e.$ParseError = true;                                                     // 13
    }                                                                           // 14
    throw e;                                                                    // 15
  }                                                                             // 16
};                                                                              // 17
                                                                                // 18
// Analyze the JavaScript source code `source` and return a dictionary of all   // 19
// globals which are assigned to in the package. The values in the dictionary   // 20
// are all `true`.                                                              // 21
//                                                                              // 22
// This is intended for use in detecting package-scope variables in Meteor      // 23
// packages, where the linker needs to add a "var" statement to prevent them    // 24
// from staying as globals.                                                     // 25
//                                                                              // 26
// It only cares about assignments to variables; an assignment to a field on an // 27
// object (`Foo.Bar = true`) neither causes `Foo` nor `Foo.Bar` to be returned. // 28
JSAnalyze.findAssignedGlobals = function (source) {                             // 29
  // escope's analyzer treats vars in the top-level "Program" node as globals.  // 30
  // The newline is necessary in case source ends with a comment.               // 31
  source = '(function () {' + source + '\n})';                                  // 32
                                                                                // 33
  var parseTree = esprimaParse(source);                                         // 34
  // We have to pass ignoreEval; otherwise, the existence of a direct eval call // 35
  // causes escope to not bother to resolve references in the eval's scope.     // 36
  // This is because an eval can pull references inward:                        // 37
  //                                                                            // 38
  //   function outer() {                                                       // 39
  //     var i = 42;                                                            // 40
  //     function inner() {                                                     // 41
  //       eval('var i = 0');                                                   // 42
  //       i;  // 0, not 42                                                     // 43
  //     }                                                                      // 44
  //   }                                                                        // 45
  //                                                                            // 46
  // But it can't pull references outward, so for our purposes it is safe to    // 47
  // ignore.                                                                    // 48
  var scoper = escope.analyze(parseTree, {ignoreEval: true});                   // 49
  var globalScope = scoper.scopes[0];                                           // 50
                                                                                // 51
  var assignedGlobals = {};                                                     // 52
  // Underscore is not available in this package.                               // 53
  globalScope.implicit.variables.forEach(function (variable) {                  // 54
    assignedGlobals[variable.name] = true;                                      // 55
  });                                                                           // 56
                                                                                // 57
  return assignedGlobals;                                                       // 58
};                                                                              // 59
                                                                                // 60
//////////////////////////////////////////////////////////////////////////////////

}).call(this);
