(function () {

//////////////////////////////////////////////////////////////////////////////////
//                                                                              //
// packages/facts/template.facts.js                                             //
//                                                                              //
//////////////////////////////////////////////////////////////////////////////////
                                                                                //
                                                                                // 1
Template.__checkName("serverFacts");                                            // 2
Template["serverFacts"] = new Template("Template.serverFacts", (function() {    // 3
  var view = this;                                                              // 4
  return HTML.UL("\n    ", Blaze.Each(function() {                              // 5
    return Spacebars.call(view.lookup("factsByPackage"));                       // 6
  }, function() {                                                               // 7
    return [ "\n      ", HTML.LI(Blaze.View("lookup:_id", function() {          // 8
      return Spacebars.mustache(view.lookup("_id"));                            // 9
    }), "\n        ", HTML.DL("\n          ", Blaze.Each(function() {           // 10
      return Spacebars.call(view.lookup("facts"));                              // 11
    }, function() {                                                             // 12
      return [ "\n            ", HTML.DT(Blaze.View("lookup:name", function() { // 13
        return Spacebars.mustache(view.lookup("name"));                         // 14
      })), "\n            ", HTML.DD(Blaze.View("lookup:value", function() {    // 15
        return Spacebars.mustache(view.lookup("value"));                        // 16
      })), "\n          " ];                                                    // 17
    }), "\n        "), "\n      "), "\n    " ];                                 // 18
  }), "\n  ");                                                                  // 19
}));                                                                            // 20
                                                                                // 21
//////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

//////////////////////////////////////////////////////////////////////////////////
//                                                                              //
// packages/facts/facts.js                                                      //
//                                                                              //
//////////////////////////////////////////////////////////////////////////////////
                                                                                //
Facts = {};                                                                     // 1
                                                                                // 2
var serverFactsCollection = 'meteor_Facts_server';                              // 3
                                                                                // 4
if (Meteor.isServer) {                                                          // 5
  // By default, we publish facts to no user if autopublish is off, and to all  // 6
  // users if autopublish is on.                                                // 7
  var userIdFilter = function (userId) {                                        // 8
    return !!Package.autopublish;                                               // 9
  };                                                                            // 10
                                                                                // 11
  // XXX make this take effect at runtime too?                                  // 12
  Facts.setUserIdFilter = function (filter) {                                   // 13
    userIdFilter = filter;                                                      // 14
  };                                                                            // 15
                                                                                // 16
  // XXX Use a minimongo collection instead and hook up an observeChanges       // 17
  // directly to a publish.                                                     // 18
  var factsByPackage = {};                                                      // 19
  var activeSubscriptions = [];                                                 // 20
                                                                                // 21
  // Make factsByPackage data available to the server environment               // 22
  Facts._factsByPackage = factsByPackage;                                       // 23
                                                                                // 24
  Facts.incrementServerFact = function (pkg, fact, increment) {                 // 25
    if (!_.has(factsByPackage, pkg)) {                                          // 26
      factsByPackage[pkg] = {};                                                 // 27
      factsByPackage[pkg][fact] = increment;                                    // 28
      _.each(activeSubscriptions, function (sub) {                              // 29
        sub.added(serverFactsCollection, pkg, factsByPackage[pkg]);             // 30
      });                                                                       // 31
      return;                                                                   // 32
    }                                                                           // 33
                                                                                // 34
    var packageFacts = factsByPackage[pkg];                                     // 35
    if (!_.has(packageFacts, fact))                                             // 36
      factsByPackage[pkg][fact] = 0;                                            // 37
    factsByPackage[pkg][fact] += increment;                                     // 38
    var changedField = {};                                                      // 39
    changedField[fact] = factsByPackage[pkg][fact];                             // 40
    _.each(activeSubscriptions, function (sub) {                                // 41
      sub.changed(serverFactsCollection, pkg, changedField);                    // 42
    });                                                                         // 43
  };                                                                            // 44
                                                                                // 45
  // Deferred, because we have an unordered dependency on livedata.             // 46
  // XXX is this safe? could somebody try to connect before Meteor.publish is   // 47
  // called?                                                                    // 48
  Meteor.defer(function () {                                                    // 49
    // XXX Also publish facts-by-package.                                       // 50
    Meteor.publish("meteor_facts", function () {                                // 51
      var sub = this;                                                           // 52
      if (!userIdFilter(this.userId)) {                                         // 53
        sub.ready();                                                            // 54
        return;                                                                 // 55
      }                                                                         // 56
      activeSubscriptions.push(sub);                                            // 57
      _.each(factsByPackage, function (facts, pkg) {                            // 58
        sub.added(serverFactsCollection, pkg, facts);                           // 59
      });                                                                       // 60
      sub.onStop(function () {                                                  // 61
        activeSubscriptions = _.without(activeSubscriptions, sub);              // 62
      });                                                                       // 63
      sub.ready();                                                              // 64
    }, {is_auto: true});                                                        // 65
  });                                                                           // 66
} else {                                                                        // 67
  Facts.server = new Mongo.Collection(serverFactsCollection);                   // 68
                                                                                // 69
  Template.serverFacts.helpers({                                                // 70
    factsByPackage: function () {                                               // 71
      return Facts.server.find();                                               // 72
    },                                                                          // 73
    facts: function () {                                                        // 74
      var factArray = [];                                                       // 75
      _.each(this, function (value, name) {                                     // 76
        if (name !== '_id')                                                     // 77
          factArray.push({name: name, value: value});                           // 78
      });                                                                       // 79
      return factArray;                                                         // 80
    }                                                                           // 81
  });                                                                           // 82
                                                                                // 83
  // Subscribe when the template is first made, and unsubscribe when it         // 84
  // is removed. If for some reason puts two copies of the template on          // 85
  // the screen at once, we'll subscribe twice. Meh.                            // 86
  Template.serverFacts.onCreated(function () {                                  // 87
    this._stopHandle = Meteor.subscribe("meteor_facts");                        // 88
  });                                                                           // 89
  Template.serverFacts.onDestroyed(function () {                                // 90
    if (this._stopHandle) {                                                     // 91
      this._stopHandle.stop();                                                  // 92
      this._stopHandle = null;                                                  // 93
    }                                                                           // 94
  });                                                                           // 95
}                                                                               // 96
                                                                                // 97
//////////////////////////////////////////////////////////////////////////////////

}).call(this);
