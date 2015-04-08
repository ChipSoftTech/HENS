(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                     //
// packages/accounts-meetup/meetup.js                                                                  //
//                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                       //
Accounts.oauth.registerService('meetup');                                                              // 1
                                                                                                       // 2
if (Meteor.isClient) {                                                                                 // 3
  Meteor.loginWithMeetup = function(options, callback) {                                               // 4
    // support a callback without options                                                              // 5
    if (! callback && typeof options === "function") {                                                 // 6
      callback = options;                                                                              // 7
      options = null;                                                                                  // 8
    }                                                                                                  // 9
                                                                                                       // 10
    var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback); // 11
    Meetup.requestCredential(options, credentialRequestCompleteCallback);                              // 12
  };                                                                                                   // 13
} else {                                                                                               // 14
  Accounts.addAutopublishFields({                                                                      // 15
    // publish all fields including access token, which can legitimately                               // 16
    // be used from the client (if transmitted over ssl or on                                          // 17
    // localhost). http://www.meetup.com/meetup_api/auth/#oauth2implicit                               // 18
    forLoggedInUser: ['services.meetup'],                                                              // 19
    forOtherUsers: ['services.meetup.id']                                                              // 20
  });                                                                                                  // 21
}                                                                                                      // 22
                                                                                                       // 23
/////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
