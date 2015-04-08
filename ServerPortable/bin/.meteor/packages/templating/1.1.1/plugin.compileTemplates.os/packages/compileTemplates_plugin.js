(function () {

/* Imports */
var CssTools = Package.minifiers.CssTools;
var UglifyJSMinify = Package.minifiers.UglifyJSMinify;
var UglifyJS = Package.minifiers.UglifyJS;
var SpacebarsCompiler = Package['spacebars-compiler'].SpacebarsCompiler;

/* Package-scope variables */
var html_scanner;

(function () {

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                              //
// plugin/html_scanner.js                                                                                       //
//                                                                                                              //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                //
html_scanner = {                                                                                                // 1
  // Scan a template file for <head>, <body>, and <template>                                                    // 2
  // tags and extract their contents.                                                                           // 3
  //                                                                                                            // 4
  // This is a primitive, regex-based scanner.  It scans                                                        // 5
  // top-level tags, which are allowed to have attributes,                                                      // 6
  // and ignores top-level HTML comments.                                                                       // 7
                                                                                                                // 8
  // Has fields 'message', 'line', 'file'                                                                       // 9
  ParseError: function () {                                                                                     // 10
  },                                                                                                            // 11
                                                                                                                // 12
  bodyAttributes : [],                                                                                          // 13
                                                                                                                // 14
  scan: function (contents, source_name) {                                                                      // 15
    var rest = contents;                                                                                        // 16
    var index = 0;                                                                                              // 17
                                                                                                                // 18
    var advance = function(amount) {                                                                            // 19
      rest = rest.substring(amount);                                                                            // 20
      index += amount;                                                                                          // 21
    };                                                                                                          // 22
                                                                                                                // 23
    var throwParseError = function (msg, overrideIndex) {                                                       // 24
      var ret = new html_scanner.ParseError;                                                                    // 25
      ret.message = msg || "bad formatting in HTML template";                                                   // 26
      ret.file = source_name;                                                                                   // 27
      var theIndex = (typeof overrideIndex === 'number' ? overrideIndex : index);                               // 28
      ret.line = contents.substring(0, theIndex).split('\n').length;                                            // 29
      throw ret;                                                                                                // 30
    };                                                                                                          // 31
                                                                                                                // 32
    var results = html_scanner._initResults();                                                                  // 33
    var rOpenTag = /^((<(template|head|body)\b)|(<!--)|(<!DOCTYPE|{{!)|$)/i;                                    // 34
                                                                                                                // 35
    while (rest) {                                                                                              // 36
      // skip whitespace first (for better line numbers)                                                        // 37
      advance(rest.match(/^\s*/)[0].length);                                                                    // 38
                                                                                                                // 39
      var match = rOpenTag.exec(rest);                                                                          // 40
      if (! match)                                                                                              // 41
        throwParseError(); // unknown text encountered                                                          // 42
                                                                                                                // 43
      var matchToken = match[1];                                                                                // 44
      var matchTokenTagName =  match[3];                                                                        // 45
      var matchTokenComment = match[4];                                                                         // 46
      var matchTokenUnsupported = match[5];                                                                     // 47
                                                                                                                // 48
      var tagStartIndex = index;                                                                                // 49
      advance(match.index + match[0].length);                                                                   // 50
                                                                                                                // 51
      if (! matchToken)                                                                                         // 52
        break; // matched $ (end of file)                                                                       // 53
      if (matchTokenComment === '<!--') {                                                                       // 54
        // top-level HTML comment                                                                               // 55
        var commentEnd = /--\s*>/.exec(rest);                                                                   // 56
        if (! commentEnd)                                                                                       // 57
          throwParseError("unclosed HTML comment");                                                             // 58
        advance(commentEnd.index + commentEnd[0].length);                                                       // 59
        continue;                                                                                               // 60
      }                                                                                                         // 61
      if (matchTokenUnsupported) {                                                                              // 62
        switch (matchTokenUnsupported.toLowerCase()) {                                                          // 63
        case '<!doctype':                                                                                       // 64
          throwParseError(                                                                                      // 65
            "Can't set DOCTYPE here.  (Meteor sets <!DOCTYPE html> for you)");                                  // 66
        case '{{!':                                                                                             // 67
          throwParseError(                                                                                      // 68
            "Can't use '{{! }}' outside a template.  Use '<!-- -->'.");                                         // 69
        }                                                                                                       // 70
        throwParseError();                                                                                      // 71
      }                                                                                                         // 72
                                                                                                                // 73
      // otherwise, a <tag>                                                                                     // 74
      var tagName = matchTokenTagName.toLowerCase();                                                            // 75
      var tagAttribs = {}; // bare name -> value dict                                                           // 76
      var rTagPart = /^\s*((([a-zA-Z0-9:_-]+)\s*=\s*(["'])(.*?)\4)|(>))/;                                       // 77
      var attr;                                                                                                 // 78
      // read attributes                                                                                        // 79
      while ((attr = rTagPart.exec(rest))) {                                                                    // 80
        var attrToken = attr[1];                                                                                // 81
        var attrKey = attr[3];                                                                                  // 82
        var attrValue = attr[5];                                                                                // 83
        advance(attr.index + attr[0].length);                                                                   // 84
        if (attrToken === '>')                                                                                  // 85
          break;                                                                                                // 86
        // XXX we don't HTML unescape the attribute value                                                       // 87
        // (e.g. to allow "abcd&quot;efg") or protect against                                                   // 88
        // collisions with methods of tagAttribs (e.g. for                                                      // 89
        // a property named toString)                                                                           // 90
        attrValue = attrValue.match(/^\s*([\s\S]*?)\s*$/)[1]; // trim                                           // 91
        tagAttribs[attrKey] = attrValue;                                                                        // 92
      }                                                                                                         // 93
      if (! attr) // didn't end on '>'                                                                          // 94
        throwParseError("Parse error in tag");                                                                  // 95
      // find </tag>                                                                                            // 96
      var end = (new RegExp('</'+tagName+'\\s*>', 'i')).exec(rest);                                             // 97
      if (! end)                                                                                                // 98
        throwParseError("unclosed <"+tagName+">");                                                              // 99
      var tagContents = rest.slice(0, end.index);                                                               // 100
      var contentsStartIndex = index;                                                                           // 101
                                                                                                                // 102
      // act on the tag                                                                                         // 103
      html_scanner._handleTag(results, tagName, tagAttribs, tagContents,                                        // 104
                              throwParseError, contentsStartIndex,                                              // 105
                              tagStartIndex);                                                                   // 106
                                                                                                                // 107
      // advance afterwards, so that line numbers in errors are correct                                         // 108
      advance(end.index + end[0].length);                                                                       // 109
    }                                                                                                           // 110
                                                                                                                // 111
    return results;                                                                                             // 112
  },                                                                                                            // 113
                                                                                                                // 114
  _initResults: function() {                                                                                    // 115
    var results = {};                                                                                           // 116
    results.head = '';                                                                                          // 117
    results.body = '';                                                                                          // 118
    results.js = '';                                                                                            // 119
    return results;                                                                                             // 120
  },                                                                                                            // 121
                                                                                                                // 122
  _handleTag: function (results, tag, attribs, contents, throwParseError,                                       // 123
                        contentsStartIndex, tagStartIndex) {                                                    // 124
                                                                                                                // 125
    // trim the tag contents.                                                                                   // 126
    // this is a courtesy and is also relied on by some unit tests.                                             // 127
    var m = contents.match(/^([ \t\r\n]*)([\s\S]*?)[ \t\r\n]*$/);                                               // 128
    contentsStartIndex += m[1].length;                                                                          // 129
    contents = m[2];                                                                                            // 130
                                                                                                                // 131
    // do we have 1 or more attribs?                                                                            // 132
    var hasAttribs = false;                                                                                     // 133
    for(var k in attribs) {                                                                                     // 134
      if (attribs.hasOwnProperty(k)) {                                                                          // 135
        hasAttribs = true;                                                                                      // 136
        break;                                                                                                  // 137
      }                                                                                                         // 138
    }                                                                                                           // 139
                                                                                                                // 140
    if (tag === "head") {                                                                                       // 141
      if (hasAttribs)                                                                                           // 142
        throwParseError("Attributes on <head> not supported");                                                  // 143
      results.head += contents;                                                                                 // 144
      return;                                                                                                   // 145
    }                                                                                                           // 146
                                                                                                                // 147
                                                                                                                // 148
    // <body> or <template>                                                                                     // 149
                                                                                                                // 150
    try {                                                                                                       // 151
      if (tag === "template") {                                                                                 // 152
        var name = attribs.name;                                                                                // 153
        if (! name)                                                                                             // 154
          throwParseError("Template has no 'name' attribute");                                                  // 155
                                                                                                                // 156
        if (SpacebarsCompiler.isReservedName(name))                                                             // 157
          throwParseError("Template can't be named \"" + name + "\"");                                          // 158
                                                                                                                // 159
        var renderFuncCode = SpacebarsCompiler.compile(                                                         // 160
          contents, {                                                                                           // 161
            isTemplate: true,                                                                                   // 162
            sourceName: 'Template "' + name + '"'                                                               // 163
          });                                                                                                   // 164
                                                                                                                // 165
        var nameLiteral = JSON.stringify(name);                                                                 // 166
        var templateDotNameLiteral = JSON.stringify("Template." + name);                                        // 167
                                                                                                                // 168
        results.js += "\nTemplate.__checkName(" + nameLiteral + ");\n" +                                        // 169
          "Template[" + nameLiteral + "] = new Template(" +                                                     // 170
          templateDotNameLiteral + ", " + renderFuncCode + ");\n";                                              // 171
      } else {                                                                                                  // 172
        // <body>                                                                                               // 173
        if (hasAttribs) {                                                                                       // 174
          // XXX we would want to throw an error here if we have duplicate                                      // 175
          // attributes, but this is complex to do with the current build system                                // 176
          // so we won't.                                                                                       // 177
          results.js += "\nMeteor.startup(function() { $('body').attr(" + JSON.stringify(attribs) + "); });\n"; // 178
        }                                                                                                       // 179
                                                                                                                // 180
        var renderFuncCode = SpacebarsCompiler.compile(                                                         // 181
          contents, {                                                                                           // 182
            isBody: true,                                                                                       // 183
            sourceName: "<body>"                                                                                // 184
          });                                                                                                   // 185
                                                                                                                // 186
        // We may be one of many `<body>` tags.                                                                 // 187
        results.js += "\nTemplate.body.addContent(" + renderFuncCode + ");\nMeteor.startup(Template.body.renderToDocument);\n";
      }                                                                                                         // 189
    } catch (e) {                                                                                               // 190
      if (e.scanner) {                                                                                          // 191
        // The error came from Spacebars                                                                        // 192
        throwParseError(e.message, contentsStartIndex + e.offset);                                              // 193
      } else {                                                                                                  // 194
        throw e;                                                                                                // 195
      }                                                                                                         // 196
    }                                                                                                           // 197
  }                                                                                                             // 198
};                                                                                                              // 199
                                                                                                                // 200
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                              //
// plugin/compile-templates.js                                                                                  //
//                                                                                                              //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                //
var path = Npm.require('path');                                                                                 // 1
                                                                                                                // 2
var doHTMLScanning = function (compileStep, htmlScanner) {                                                      // 3
  // XXX the way we deal with encodings here is sloppy .. should get                                            // 4
  // religion on that                                                                                           // 5
  var contents = compileStep.read().toString('utf8');                                                           // 6
  try {                                                                                                         // 7
    var results = htmlScanner.scan(contents, compileStep.inputPath);                                            // 8
  } catch (e) {                                                                                                 // 9
    if (e instanceof htmlScanner.ParseError) {                                                                  // 10
      compileStep.error({                                                                                       // 11
        message: e.message,                                                                                     // 12
        sourcePath: compileStep.inputPath,                                                                      // 13
        line: e.line                                                                                            // 14
      });                                                                                                       // 15
      return;                                                                                                   // 16
    } else                                                                                                      // 17
      throw e;                                                                                                  // 18
  }                                                                                                             // 19
                                                                                                                // 20
  if (results.head)                                                                                             // 21
    compileStep.appendDocument({ section: "head", data: results.head });                                        // 22
                                                                                                                // 23
  if (results.body)                                                                                             // 24
    compileStep.appendDocument({ section: "body", data: results.body });                                        // 25
                                                                                                                // 26
  if (results.js) {                                                                                             // 27
    var path_part = path.dirname(compileStep.inputPath);                                                        // 28
    if (path_part === '.')                                                                                      // 29
      path_part = '';                                                                                           // 30
    if (path_part.length && path_part !== path.sep)                                                             // 31
      path_part = path_part + path.sep;                                                                         // 32
    var ext = path.extname(compileStep.inputPath);                                                              // 33
    var basename = path.basename(compileStep.inputPath, ext);                                                   // 34
                                                                                                                // 35
    // XXX generate a source map                                                                                // 36
                                                                                                                // 37
    compileStep.addJavaScript({                                                                                 // 38
      path: path.join(path_part, "template." + basename + ".js"),                                               // 39
      sourcePath: compileStep.inputPath,                                                                        // 40
      data: results.js                                                                                          // 41
    });                                                                                                         // 42
  }                                                                                                             // 43
};                                                                                                              // 44
                                                                                                                // 45
Plugin.registerSourceHandler(                                                                                   // 46
  "html", {isTemplate: true, archMatching: 'web'},                                                              // 47
  function (compileStep) {                                                                                      // 48
    doHTMLScanning(compileStep, html_scanner);                                                                  // 49
  }                                                                                                             // 50
);                                                                                                              // 51
                                                                                                                // 52
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.compileTemplates = {};

})();

//# sourceMappingURL=compileTemplates_plugin.js.map
