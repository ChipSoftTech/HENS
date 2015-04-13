(function () {

////////////////////////////////////////////////////////////////////////////////////////
//                                                                                    //
// packages/test-helpers/try_all_permutations.js                                      //
//                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////
                                                                                      //
// Given some functions, run them in every possible order.                            // 1
//                                                                                    // 2
// In simplest usage, takes one argument, an array of functions. Run                  // 3
// those functions in every possible order. Or, if the first element                  // 4
// of the array is an integer N, with the remaining elements being                    // 5
// functions (N <= the number of functions), run every permutation of                 // 6
// N functions from the array.                                                        // 7
//                                                                                    // 8
// Eg:                                                                                // 9
// try_all_permutations([A, B, C])                                                    // 10
// => runs A, B, C; A, C, B; B, A, C; B, C, A; C, A, B; C, B, A                       // 11
// (semicolons for clarity only)                                                      // 12
//                                                                                    // 13
// try_all_permutations([2, A, B, C])                                                 // 14
// => runs A, B; A, C; B, A; B, C; C, A; C, B                                         // 15
//                                                                                    // 16
// If more than one argument A_1, A_2 ... A_n is passed, each should                  // 17
// be an array as described above. Compute the possible orderings O_1,                // 18
// O_2 ... O_n per above, and run the Cartesian product of the                        // 19
// sets. (Except that unlike a proper Cartesian product, a set with                   // 20
// zero elements will simply be ignored.)                                             // 21
//                                                                                    // 22
// Eg:                                                                                // 23
// try_all_permutations([X], [A, B], [Y])                                             // 24
// => runs X, A, B, Y; X, B, A, Y                                                     // 25
// try_all_permutations([X], [A, B], [], [Y])                                         // 26
// => same                                                                            // 27
//                                                                                    // 28
// If a function is passed instead of an array, it will be treated as                 // 29
// an array with one argument. In other words, these are the same:                    // 30
// try_all_permutations([X], [A, B], [Y])                                             // 31
// try_all_permutations(X, [A, B], Y)                                                 // 32
                                                                                      // 33
try_all_permutations = function () {                                                  // 34
  var args = Array.prototype.slice.call(arguments);                                   // 35
                                                                                      // 36
  var current_set = 0;                                                                // 37
  var chosen = [];                                                                    // 38
                                                                                      // 39
  var expand_next_set = function () {                                                 // 40
    if (current_set === args.length) {                                                // 41
      _.each(chosen, function (f) { f(); });                                          // 42
    } else {                                                                          // 43
      var set = args[current_set];                                                    // 44
      if (typeof set === "function")                                                  // 45
        set = [set];                                                                  // 46
                                                                                      // 47
      current_set++;                                                                  // 48
      if (typeof set[0] === "number")                                                 // 49
        pick(set[0], set.slice(1));                                                   // 50
      else                                                                            // 51
        pick(set.length, set);                                                        // 52
      current_set--;                                                                  // 53
    }                                                                                 // 54
  };                                                                                  // 55
                                                                                      // 56
  var pick = function (how_many, remaining) {                                         // 57
    if (how_many === 0)                                                               // 58
      expand_next_set();                                                              // 59
    else {                                                                            // 60
      for (var i = 0; i < remaining.length; i++) {                                    // 61
        chosen.push(remaining[i]);                                                    // 62
        pick(how_many - 1,                                                            // 63
             remaining.slice(0, i).concat(remaining.slice(i + 1)));                   // 64
        chosen.pop();                                                                 // 65
      }                                                                               // 66
    }                                                                                 // 67
  };                                                                                  // 68
                                                                                      // 69
  expand_next_set();                                                                  // 70
};                                                                                    // 71
                                                                                      // 72
////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////
//                                                                                    //
// packages/test-helpers/async_multi.js                                               //
//                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////
                                                                                      //
// This depends on tinytest, so it's a little weird to put it in                      // 1
// test-helpers, but it'll do for now.                                                // 2
                                                                                      // 3
// Provides the testAsyncMulti helper, which creates an async test                    // 4
// (using Tinytest.addAsync) that tracks parallel and sequential                      // 5
// asynchronous calls.  Specifically, the two features it provides                    // 6
// are:                                                                               // 7
// 1) Executing an array of functions sequentially when those functions               // 8
//    contain async calls.                                                            // 9
// 2) Keeping track of when callbacks are outstanding, via "expect".                  // 10
//                                                                                    // 11
// To use, pass an array of functions that take arguments (test, expect).             // 12
// (There is no onComplete callback; completion is determined automatically.)         // 13
// Expect takes a callback closure and wraps it, returning a new callback closure,    // 14
// and making a note that there is a callback oustanding.  Pass this returned closure // 15
// to async functions as the callback, and the machinery in the wrapper will          // 16
// record the fact that the callback has been called.                                 // 17
//                                                                                    // 18
// A second form of expect takes data arguments to test for.                          // 19
// Essentially, expect("foo", "bar") is equivalent to:                                // 20
// expect(function(arg1, arg2) { test.equal([arg1, arg2], ["foo", "bar"]); }).        // 21
//                                                                                    // 22
// You cannot "nest" expect or call it from a callback!  Even if you have a chain     // 23
// of callbacks, you need to call expect at the "top level" (synchronously)           // 24
// but the callback you wrap has to be the last/innermost one.  This sometimes        // 25
// leads to some code contortions and should probably be fixed.                       // 26
                                                                                      // 27
// Example: (at top level of test file)                                               // 28
//                                                                                    // 29
// testAsyncMulti("test name", [                                                      // 30
//   function(test, expect) {                                                         // 31
//     ... tests here                                                                 // 32
//     Meteor.defer(expect(function() {                                               // 33
//       ... tests here                                                               // 34
//     }));                                                                           // 35
//                                                                                    // 36
//     call_something_async('foo', 'bar', expect('baz')); // implicit callback        // 37
//                                                                                    // 38
//   },                                                                               // 39
//   function(test, expect) {                                                         // 40
//     ... more tests                                                                 // 41
//   }                                                                                // 42
// ]);                                                                                // 43
                                                                                      // 44
var ExpectationManager = function (test, onComplete) {                                // 45
  var self = this;                                                                    // 46
                                                                                      // 47
  self.test = test;                                                                   // 48
  self.onComplete = onComplete;                                                       // 49
  self.closed = false;                                                                // 50
  self.dead = false;                                                                  // 51
  self.outstanding = 0;                                                               // 52
};                                                                                    // 53
                                                                                      // 54
_.extend(ExpectationManager.prototype, {                                              // 55
  expect: function (/* arguments */) {                                                // 56
    var self = this;                                                                  // 57
                                                                                      // 58
    if (typeof arguments[0] === "function")                                           // 59
      var expected = arguments[0];                                                    // 60
    else                                                                              // 61
      var expected = _.toArray(arguments);                                            // 62
                                                                                      // 63
    if (self.closed)                                                                  // 64
      throw new Error("Too late to add more expectations to the test");               // 65
    self.outstanding++;                                                               // 66
                                                                                      // 67
    return function (/* arguments */) {                                               // 68
      if (self.dead)                                                                  // 69
        return;                                                                       // 70
                                                                                      // 71
      if (typeof expected === "function") {                                           // 72
        try {                                                                         // 73
          expected.apply({}, arguments);                                              // 74
        } catch (e) {                                                                 // 75
          if (self.cancel())                                                          // 76
            self.test.exception(e);                                                   // 77
        }                                                                             // 78
      } else {                                                                        // 79
        self.test.equal(_.toArray(arguments), expected);                              // 80
      }                                                                               // 81
                                                                                      // 82
      self.outstanding--;                                                             // 83
      self._check_complete();                                                         // 84
    };                                                                                // 85
  },                                                                                  // 86
                                                                                      // 87
  done: function () {                                                                 // 88
    var self = this;                                                                  // 89
    self.closed = true;                                                               // 90
    self._check_complete();                                                           // 91
  },                                                                                  // 92
                                                                                      // 93
  cancel: function () {                                                               // 94
    var self = this;                                                                  // 95
    if (! self.dead) {                                                                // 96
      self.dead = true;                                                               // 97
      return true;                                                                    // 98
    }                                                                                 // 99
    return false;                                                                     // 100
  },                                                                                  // 101
                                                                                      // 102
  _check_complete: function () {                                                      // 103
    var self = this;                                                                  // 104
    if (!self.outstanding && self.closed && !self.dead) {                             // 105
      self.dead = true;                                                               // 106
      self.onComplete();                                                              // 107
    }                                                                                 // 108
  }                                                                                   // 109
});                                                                                   // 110
                                                                                      // 111
testAsyncMulti = function (name, funcs) {                                             // 112
  // XXX Tests on remote browsers are _slow_. We need a better solution.              // 113
  var timeout = 180000;                                                               // 114
                                                                                      // 115
  Tinytest.addAsync(name, function (test, onComplete) {                               // 116
    var remaining = _.clone(funcs);                                                   // 117
    var context = {};                                                                 // 118
    var i = 0;                                                                        // 119
                                                                                      // 120
    var runNext = function () {                                                       // 121
      var func = remaining.shift();                                                   // 122
      if (!func) {                                                                    // 123
        delete test.extraDetails.asyncBlock;                                          // 124
        onComplete();                                                                 // 125
      }                                                                               // 126
      else {                                                                          // 127
        var em = new ExpectationManager(test, function () {                           // 128
          Meteor.clearTimeout(timer);                                                 // 129
          runNext();                                                                  // 130
        });                                                                           // 131
                                                                                      // 132
        var timer = Meteor.setTimeout(function () {                                   // 133
          if (em.cancel()) {                                                          // 134
            test.fail({type: "timeout", message: "Async batch timed out"});           // 135
            onComplete();                                                             // 136
          }                                                                           // 137
          return;                                                                     // 138
        }, timeout);                                                                  // 139
                                                                                      // 140
        test.extraDetails.asyncBlock = i++;                                           // 141
        try {                                                                         // 142
          func.apply(context, [test, _.bind(em.expect, em)]);                         // 143
        } catch (exception) {                                                         // 144
          if (em.cancel())                                                            // 145
            test.exception(exception);                                                // 146
          Meteor.clearTimeout(timer);                                                 // 147
          // Because we called test.exception, we're not to call onComplete.          // 148
          return;                                                                     // 149
        }                                                                             // 150
        em.done();                                                                    // 151
      }                                                                               // 152
    };                                                                                // 153
                                                                                      // 154
    runNext();                                                                        // 155
  });                                                                                 // 156
};                                                                                    // 157
                                                                                      // 158
// Call `fn` periodically until it returns true.  If it does, call                    // 159
// `success`.  If it doesn't before the timeout, call `failed`.                       // 160
simplePoll = function (fn, success, failed, timeout, step) {                          // 161
  timeout = timeout || 10000;                                                         // 162
  step = step || 100;                                                                 // 163
  var start = (new Date()).valueOf();                                                 // 164
  var helper = function () {                                                          // 165
    if (fn()) {                                                                       // 166
      success();                                                                      // 167
      return;                                                                         // 168
    }                                                                                 // 169
    if (start + timeout < (new Date()).valueOf()) {                                   // 170
      failed();                                                                       // 171
      return;                                                                         // 172
    }                                                                                 // 173
    Meteor.setTimeout(helper, step);                                                  // 174
  };                                                                                  // 175
  helper();                                                                           // 176
};                                                                                    // 177
                                                                                      // 178
pollUntil = function (expect, f, timeout, step, noFail) {                             // 179
  noFail = noFail || false;                                                           // 180
  step = step || 100;                                                                 // 181
  var expectation = expect(true);                                                     // 182
  simplePoll(                                                                         // 183
    f,                                                                                // 184
    function () { expectation(true) },                                                // 185
    function () { expectation(noFail) },                                              // 186
    timeout,                                                                          // 187
    step                                                                              // 188
  );                                                                                  // 189
};                                                                                    // 190
                                                                                      // 191
////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////
//                                                                                    //
// packages/test-helpers/event_simulation.js                                          //
//                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////
                                                                                      //
// possible options:                                                                  // 1
// bubbles: A boolean indicating whether the event should bubble up through           // 2
//  the event chain or not. (default is true)                                         // 3
simulateEvent = function (node, event, args, options) {                               // 4
  node = (node instanceof $ ? node[0] : node);                                        // 5
                                                                                      // 6
  var bubbles = (options && "bubbles" in options) ? options.bubbles : true;           // 7
                                                                                      // 8
  if (document.createEvent) {                                                         // 9
    var e = document.createEvent("Event");                                            // 10
    e.initEvent(event, bubbles, true);                                                // 11
    _.extend(e, args);                                                                // 12
    node.dispatchEvent(e);                                                            // 13
  } else {                                                                            // 14
    var e = document.createEventObject();                                             // 15
    _.extend(e, args);                                                                // 16
    node.fireEvent("on" + event, e);                                                  // 17
  }                                                                                   // 18
};                                                                                    // 19
                                                                                      // 20
focusElement = function(elem) {                                                       // 21
  // This sequence is for benefit of IE 8 and 9;                                      // 22
  // test there before changing.                                                      // 23
  window.focus();                                                                     // 24
  elem.focus();                                                                       // 25
  elem.focus();                                                                       // 26
                                                                                      // 27
  // focus() should set document.activeElement                                        // 28
  if (document.activeElement !== elem)                                                // 29
    throw new Error("focus() didn't set activeElement");                              // 30
};                                                                                    // 31
                                                                                      // 32
blurElement = function(elem) {                                                        // 33
  elem.blur();                                                                        // 34
  if (document.activeElement === elem)                                                // 35
    throw new Error("blur() didn't affect activeElement");                            // 36
};                                                                                    // 37
                                                                                      // 38
clickElement = function(elem) {                                                       // 39
  if (elem.click)                                                                     // 40
    elem.click(); // supported by form controls cross-browser; most native way        // 41
  else                                                                                // 42
    simulateEvent(elem, 'click');                                                     // 43
};                                                                                    // 44
                                                                                      // 45
////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////
//                                                                                    //
// packages/test-helpers/seeded_random.js                                             //
//                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////
                                                                                      //
SeededRandom = function(seed) { // seed may be a string or any type                   // 1
  if (! (this instanceof SeededRandom))                                               // 2
    return new SeededRandom(seed);                                                    // 3
                                                                                      // 4
  seed = seed || "seed";                                                              // 5
  this.gen = Random.createWithSeeds(seed).alea; // from random.js                     // 6
};                                                                                    // 7
SeededRandom.prototype.next = function() {                                            // 8
  return this.gen();                                                                  // 9
};                                                                                    // 10
SeededRandom.prototype.nextBoolean = function() {                                     // 11
  return this.next() >= 0.5;                                                          // 12
};                                                                                    // 13
SeededRandom.prototype.nextIntBetween = function(min, max) {                          // 14
  // inclusive of min and max                                                         // 15
  return Math.floor(this.next() * (max-min+1)) + min;                                 // 16
};                                                                                    // 17
SeededRandom.prototype.nextIdentifier = function(optLen) {                            // 18
  var letters = [];                                                                   // 19
  var len = (typeof optLen === "number" ? optLen : 12);                               // 20
  for(var i=0; i<len; i++)                                                            // 21
    letters.push(String.fromCharCode(this.nextIntBetween(97, 122)));                  // 22
  var x;                                                                              // 23
  return letters.join('');                                                            // 24
};                                                                                    // 25
SeededRandom.prototype.nextChoice = function(list) {                                  // 26
  return list[this.nextIntBetween(0, list.length-1)];                                 // 27
};                                                                                    // 28
                                                                                      // 29
////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////
//                                                                                    //
// packages/test-helpers/canonicalize_html.js                                         //
//                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////
                                                                                      //
canonicalizeHtml = function(html) {                                                   // 1
  var h = html;                                                                       // 2
  // kill IE-specific comments inserted by DomRange                                   // 3
  h = h.replace(/<!--IE-->/g, '');                                                    // 4
  h = h.replace(/<!---->/g, '');                                                      // 5
  // ignore exact text of comments                                                    // 6
  h = h.replace(/<!--.*?-->/g, '<!---->');                                            // 7
  // make all tags lowercase                                                          // 8
  h = h.replace(/<\/?(\w+)/g, function(m) {                                           // 9
    return m.toLowerCase(); });                                                       // 10
  // replace whitespace sequences with spaces                                         // 11
  h = h.replace(/\s+/g, ' ');                                                         // 12
  // Trim leading and trailing whitespace                                             // 13
  h = h.replace(/^\s+|\s+$/g, '');                                                    // 14
  // remove whitespace before and after tags                                          // 15
  h = h.replace(/\s*(<\/?\w.*?>)\s*/g, function (m, tag) {                            // 16
    return tag; });                                                                   // 17
  // make tag attributes uniform                                                      // 18
  h = h.replace(/<(\w+)\s+(.*?)\s*>/g, function(m, tagName, attrs) {                  // 19
    // Drop expando property used by Sizzle (part of jQuery) which leaks into         // 20
    // attributes in IE8. Note that its value always contains spaces.                 // 21
    attrs = attrs.replace(/sizcache[0-9]+="[^"]*"/g, ' ');                            // 22
    // Similarly for expando properties used by jQuery to track data.                 // 23
    attrs = attrs.replace(/jQuery[0-9]+="[0-9]+"/g, ' ');                             // 24
    // Similarly for expando properties used to DOMBackend to keep                    // 25
    // track of callbacks to fire when an element is removed                          // 26
    attrs = attrs.replace(/\$blaze_teardown_callbacks="[^"]*"/g, ' ');                // 27
    // And by DOMRange to keep track of the element's DOMRange                        // 28
    attrs = attrs.replace(/\$blaze_range="[^"]*"/g, ' ');                             // 29
                                                                                      // 30
    attrs = attrs.replace(/\s*=\s*/g, '=');                                           // 31
    attrs = attrs.replace(/^\s+/g, '');                                               // 32
    attrs = attrs.replace(/\s+$/g, '');                                               // 33
    attrs = attrs.replace(/\s+/g, ' ');                                               // 34
    // quote unquoted attribute values, as in `type=checkbox`.  This                  // 35
    // will do the wrong thing if there's an `=` in an attribute value.               // 36
    attrs = attrs.replace(/(\w)=([^'" >/]+)/g, '$1="$2"');                            // 37
                                                                                      // 38
    // for the purpose of splitting attributes in a string like 'a="b"                // 39
    // c="d"', assume they are separated by a single space and values                 // 40
    // are double- or single-quoted, but allow for spaces inside the                  // 41
    // quotes.  Split on space following quote.                                       // 42
    var attrList = attrs.replace(/(\w)='([^']*)' /g, "$1='$2'\u0000");                // 43
    attrList = attrList.replace(/(\w)="([^"]*)" /g, '$1="$2"\u0000');                 // 44
    attrList = attrList.split("\u0000");                                              // 45
    // put attributes in alphabetical order                                           // 46
    attrList.sort();                                                                  // 47
                                                                                      // 48
    var tagContents = [tagName];                                                      // 49
                                                                                      // 50
    for(var i=0; i<attrList.length; i++) {                                            // 51
      // If there were no attrs, attrList could be `[""]`,                            // 52
      // so skip falsy values.                                                        // 53
      if (! attrList[i])                                                              // 54
        continue;                                                                     // 55
      var a = attrList[i].split('=');                                                 // 56
                                                                                      // 57
      // In IE8, attributes whose value is "" appear                                  // 58
      // without the '=' sign altogether.                                             // 59
      if (a.length < 2)                                                               // 60
        a.push("");                                                                   // 61
                                                                                      // 62
      var key = a[0];                                                                 // 63
      // Drop another expando property used by Sizzle.                                // 64
      if (key === 'sizset')                                                           // 65
        continue;                                                                     // 66
      var value = a[1];                                                               // 67
                                                                                      // 68
      // make sure the attribute is doubled-quoted                                    // 69
      if (value.charAt(0) === '"') {                                                  // 70
        // Do nothing                                                                 // 71
      } else {                                                                        // 72
        if (value.charAt(0) !== "'") {                                                // 73
          // attribute is unquoted. should be unreachable because of                  // 74
          // regex above.                                                             // 75
          value = '"' + value + '"';                                                  // 76
        } else {                                                                      // 77
          // attribute is single-quoted. make it double-quoted.                       // 78
          value = value.replace(/\"/g, "&quot;");                                     // 79
        }                                                                             // 80
        value = value.replace(/["'`]/g, '"');                                         // 81
      }                                                                               // 82
                                                                                      // 83
      // Encode quotes and double quotes in the attribute.                            // 84
      var attr = value.slice(1, -1);                                                  // 85
      attr = attr.replace(/\"/g, "&quot;");                                           // 86
      attr = attr.replace(/\'/g, "&quot;");                                           // 87
      value = '"' + attr + '"';                                                       // 88
                                                                                      // 89
      // Ensure that styles do not end with a semicolon.                              // 90
      if (key === 'style') {                                                          // 91
        value = value.replace(/;\"$/, '"');                                           // 92
      }                                                                               // 93
                                                                                      // 94
      tagContents.push(key+'='+value);                                                // 95
    }                                                                                 // 96
    return '<'+tagContents.join(' ')+'>';                                             // 97
  });                                                                                 // 98
  return h;                                                                           // 99
};                                                                                    // 100
                                                                                      // 101
////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////
//                                                                                    //
// packages/test-helpers/render_div.js                                                //
//                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////
                                                                                      //
renderToDiv = function (template, optData) {                                          // 1
  var div = document.createElement("DIV");                                            // 2
  if (optData == null) {                                                              // 3
    Blaze.render(template, div);                                                      // 4
  } else {                                                                            // 5
    Blaze.renderWithData(template, optData, div);                                     // 6
  }                                                                                   // 7
  return div;                                                                         // 8
};                                                                                    // 9
                                                                                      // 10
////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////
//                                                                                    //
// packages/test-helpers/current_style.js                                             //
//                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////
                                                                                      //
// Cross-browser implementation of getting the computed style of an element.          // 1
getStyleProperty = function(n, prop) {                                                // 2
  if (n.currentStyle) {                                                               // 3
    // camelCase it for IE                                                            // 4
    return n.currentStyle[prop.replace(                                               // 5
      /-([a-z])/g,                                                                    // 6
      function(x,y) { return y.toUpperCase(); })];                                    // 7
  } else {                                                                            // 8
    return window.getComputedStyle(n, null).getPropertyValue(prop);                   // 9
  }                                                                                   // 10
};                                                                                    // 11
                                                                                      // 12
////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////
//                                                                                    //
// packages/test-helpers/callback_logger.js                                           //
//                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////
                                                                                      //
// This file allows you to write tests that expect certain callbacks to be            // 1
// called in certain orders, or optionally in groups where the order does not         // 2
// matter.  It can be set up in either a synchronous manner, so that each             // 3
// callback must have already occured before you call expectResult & its ilk, or      // 4
// in an asynchronous manner, so that the logger yields and waits a reasonable        // 5
// timeout for the callback.  Because we're using Node Fibers to yield & start        // 6
// ourselves, the asynchronous version is only available on the server.               // 7
                                                                                      // 8
var Fiber = Meteor.isServer ? Npm.require('fibers') : null;                           // 9
                                                                                      // 10
var TIMEOUT = 1000;                                                                   // 11
                                                                                      // 12
// Run the given function, passing it a correctly-set-up callback logger as an        // 13
// argument.  If we're meant to be running asynchronously, the function gets its      // 14
// own Fiber.                                                                         // 15
                                                                                      // 16
withCallbackLogger = function (test, callbackNames, async, fun) {                     // 17
  var logger = new CallbackLogger(test, callbackNames);                               // 18
  if (async) {                                                                        // 19
    if (!Fiber)                                                                       // 20
      throw new Error("Fiber is not available");                                      // 21
    logger.fiber = Fiber(_.bind(fun, null, logger));                                  // 22
    logger.fiber.run();                                                               // 23
  } else {                                                                            // 24
    fun(logger);                                                                      // 25
  }                                                                                   // 26
};                                                                                    // 27
                                                                                      // 28
var CallbackLogger = function (test, callbackNames) {                                 // 29
  var self = this;                                                                    // 30
  self._log = [];                                                                     // 31
  self._test = test;                                                                  // 32
  self._yielded = false;                                                              // 33
  _.each(callbackNames, function (callbackName) {                                     // 34
    self[callbackName] = function () {                                                // 35
      var args = _.toArray(arguments);                                                // 36
      self._log.push({callback: callbackName, args: args});                           // 37
      if (self.fiber) {                                                               // 38
        setTimeout(function () {                                                      // 39
          if (self._yielded)                                                          // 40
            self.fiber.run(callbackName);                                             // 41
        }, 0);                                                                        // 42
      }                                                                               // 43
    };                                                                                // 44
  });                                                                                 // 45
};                                                                                    // 46
                                                                                      // 47
CallbackLogger.prototype._yield = function (arg) {                                    // 48
  var self = this;                                                                    // 49
  self._yielded = true;                                                               // 50
  var y = Fiber.yield(arg);                                                           // 51
  self._yielded = false;                                                              // 52
  return y;                                                                           // 53
};                                                                                    // 54
                                                                                      // 55
CallbackLogger.prototype.expectResult = function (callbackName, args) {               // 56
  var self = this;                                                                    // 57
  self._waitForLengthOrTimeout(1);                                                    // 58
  if (_.isEmpty(self._log)) {                                                         // 59
    self._test.fail(["Expected callback " + callbackName + " got none"]);             // 60
    return;                                                                           // 61
  }                                                                                   // 62
  var result = self._log.shift();                                                     // 63
  self._test.equal(result.callback, callbackName);                                    // 64
  self._test.equal(result.args, args);                                                // 65
};                                                                                    // 66
                                                                                      // 67
CallbackLogger.prototype.expectResultOnly = function (callbackName, args) {           // 68
  var self = this;                                                                    // 69
  self.expectResult(callbackName, args);                                              // 70
  self._expectNoResultImpl();                                                         // 71
}                                                                                     // 72
                                                                                      // 73
CallbackLogger.prototype._waitForLengthOrTimeout = function (len) {                   // 74
  var self = this;                                                                    // 75
  if (self.fiber) {                                                                   // 76
    var timeLeft = TIMEOUT;                                                           // 77
    var startTime = new Date();                                                       // 78
    var handle = setTimeout(function () {                                             // 79
      self.fiber.run(handle);                                                         // 80
    }, TIMEOUT);                                                                      // 81
    while (self._log.length < len) {                                                  // 82
      if (self._yield() === handle) {                                                 // 83
        break;                                                                        // 84
      }                                                                               // 85
    }                                                                                 // 86
    clearTimeout(handle);                                                             // 87
  }                                                                                   // 88
};                                                                                    // 89
                                                                                      // 90
CallbackLogger.prototype.expectResultUnordered = function (list) {                    // 91
  var self = this;                                                                    // 92
                                                                                      // 93
  self._waitForLengthOrTimeout(list.length);                                          // 94
                                                                                      // 95
  list = _.clone(list); // shallow copy.                                              // 96
  var i = list.length;                                                                // 97
  while (i > 0) {                                                                     // 98
    var found = false;                                                                // 99
    var dequeued = self._log.shift();                                                 // 100
    for (var j = 0; j < list.length; j++) {                                           // 101
      if (_.isEqual(list[j], dequeued)) {                                             // 102
        list.splice(j, 1);                                                            // 103
        found = true;                                                                 // 104
        break;                                                                        // 105
      }                                                                               // 106
    }                                                                                 // 107
    if (!found)                                                                       // 108
      self._test.fail(["Found unexpected result: " + JSON.stringify(dequeued)]);      // 109
    i--;                                                                              // 110
  }                                                                                   // 111
};                                                                                    // 112
                                                                                      // 113
CallbackLogger.prototype._expectNoResultImpl = function () {                          // 114
  var self = this;                                                                    // 115
  self._test.length(self._log, 0);                                                    // 116
};                                                                                    // 117
                                                                                      // 118
CallbackLogger.prototype.expectNoResult = function () {                               // 119
  var self = this;                                                                    // 120
  if (self.fiber) {                                                                   // 121
    var handle = setTimeout(function () {                                             // 122
      self.fiber.run(handle);                                                         // 123
    }, TIMEOUT);                                                                      // 124
    var foo = self._yield();                                                          // 125
    while (_.isEmpty(self._log) && foo !== handle) {                                  // 126
      foo = self._yield();                                                            // 127
    }                                                                                 // 128
    clearTimeout(handle);                                                             // 129
  }                                                                                   // 130
  self._expectNoResultImpl();                                                         // 131
};                                                                                    // 132
                                                                                      // 133
////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////
//                                                                                    //
// packages/test-helpers/domutils.js                                                  //
//                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////
                                                                                      //
var testDiv = document.createElement("div");                                          // 1
testDiv.innerHTML = "   <link/><table></table><select><!----></select>";              // 2
// Need to wrap in a div rather than directly creating SELECT to avoid                // 3
// *another* IE bug.                                                                  // 4
var testSelectDiv = document.createElement("div");                                    // 5
testSelectDiv.innerHTML = "<select><option selected>Foo</option></select>";           // 6
testSelectDiv.firstChild.setAttribute("name", "myname");                              // 7
                                                                                      // 8
// Tests that, if true, indicate browser quirks present.                              // 9
var quirks = {                                                                        // 10
  // IE loses initial whitespace when setting innerHTML.                              // 11
  leadingWhitespaceKilled: (testDiv.firstChild.nodeType !== 3),                       // 12
                                                                                      // 13
  // IE may insert an empty tbody tag in a table.                                     // 14
  tbodyInsertion: testDiv.getElementsByTagName("tbody").length > 0,                   // 15
                                                                                      // 16
  // IE loses some tags in some environments (requiring extra wrapper).               // 17
  tagsLost: testDiv.getElementsByTagName("link").length === 0,                        // 18
                                                                                      // 19
  // IE <= 9 loses HTML comments in <select> and <option> tags.                       // 20
  commentsLost: (! testDiv.getElementsByTagName("select")[0].firstChild),             // 21
                                                                                      // 22
  selectValueMustBeFromAttribute: (testSelectDiv.firstChild.value !== "Foo"),         // 23
                                                                                      // 24
  // In IE7, setAttribute('name', foo) doesn't show up in rendered HTML.              // 25
  // (In FF3, outerHTML is undefined, but it doesn't have this quirk.)                // 26
  mustSetNameInCreateElement: (                                                       // 27
    testSelectDiv.firstChild.outerHTML &&                                             // 28
      testSelectDiv.firstChild.outerHTML.indexOf("myname") === -1)                    // 29
};                                                                                    // 30
                                                                                      // 31
DomUtils = {};                                                                        // 32
                                                                                      // 33
DomUtils.setElementValue = function (node, value) {                                   // 34
  // Try to assign the value.                                                         // 35
  node.value = value;                                                                 // 36
  if (node.value === value || node.nodeName !== 'SELECT')                             // 37
    return;                                                                           // 38
                                                                                      // 39
  // IE (all versions) appears to only let you assign SELECT values which             // 40
  // match valid OPTION values... and moreover, the OPTION value must be              // 41
  // explicitly given as an attribute, not just as the text. So we hunt for           // 42
  // the OPTION and select it.                                                        // 43
  var options = $(node).find('option');                                               // 44
  for (var i = 0; i < options.length; ++i) {                                          // 45
    if (DomUtils.getElementValue(options[i]) === value) {                             // 46
      options[i].selected = true;                                                     // 47
      return;                                                                         // 48
    }                                                                                 // 49
  }                                                                                   // 50
};                                                                                    // 51
                                                                                      // 52
// Gets the value of an element, portably across browsers. There's a special          // 53
// case for SELECT elements in IE.                                                    // 54
DomUtils.getElementValue = function (node) {                                          // 55
  if (!quirks.selectValueMustBeFromAttribute)                                         // 56
    return node.value;                                                                // 57
                                                                                      // 58
  if (node.nodeName === 'OPTION') {                                                   // 59
    // Inspired by jQuery.valHooks.option.get.                                        // 60
    var val = node.attributes.value;                                                  // 61
    return !val || val.specified ? node.value : node.text;                            // 62
  } else if (node.nodeName === 'SELECT') {                                            // 63
    if (node.selectedIndex < 0)                                                       // 64
      return null;                                                                    // 65
    return DomUtils.getElementValue(node.options[node.selectedIndex]);                // 66
  } else {                                                                            // 67
    return node.value;                                                                // 68
  }                                                                                   // 69
};                                                                                    // 70
                                                                                      // 71
////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
