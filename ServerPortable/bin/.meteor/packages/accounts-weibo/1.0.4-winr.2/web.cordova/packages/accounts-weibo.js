(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                     //
// packages/accounts-weibo/weibo.js                                                                    //
//                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                       //
Accounts.oauth.registerService('weibo');                                                               // 1
                                                                                                       // 2
if (Meteor.isClient) {                                                                                 // 3
  Meteor.loginWithWeibo = function(options, callback) {                                                // 4
    // support a callback without options                                                              // 5
    if (! callback && typeof options === "function") {                                                 // 6
      callback = options;                                                                              // 7
      options = null;                                                                                  // 8
    }                                                                                                  // 9
                                                                                                       // 10
    var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback); // 11
    Weibo.requestCredential(options, credentialRequestCompleteCallback);                               // 12
  };                                                                                                   // 13
} else {                                                                                               // 14
  Accounts.addAutopublishFields({                                                                      // 15
    // publish all fields including access token, which can legitimately                               // 16
    // be used from the client (if transmitted over ssl or on localhost)                               // 17
    forLoggedInUser: ['services.weibo'],                                                               // 18
    forOtherUsers: ['services.weibo.screenName']                                                       // 19
  });                                                                                                  // 20
}                                                                                                      // 21
                                                                                                       // 22
/////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
