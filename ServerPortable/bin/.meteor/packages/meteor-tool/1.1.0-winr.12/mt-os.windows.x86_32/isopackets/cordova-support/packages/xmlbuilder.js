(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;

/* Package-scope variables */
var XmlBuilder;

(function () {

///////////////////////////////////////////////////////////////////////
//                                                                   //
// packages/xmlbuilder/xmlbuilder.js                                 //
//                                                                   //
///////////////////////////////////////////////////////////////////////
                                                                     //
XmlBuilder = Npm.require('xmlbuilder');


///////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.xmlbuilder = {
  XmlBuilder: XmlBuilder
};

})();

//# sourceMappingURL=xmlbuilder.js.map
