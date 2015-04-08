(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                 //
// packages/meteor-developer/meteor_developer_common.js                                            //
//                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                   //
MeteorDeveloperAccounts = {};                                                                      // 1
                                                                                                   // 2
MeteorDeveloperAccounts._server = "https://www.meteor.com";                                        // 3
                                                                                                   // 4
// Options are:                                                                                    // 5
//  - developerAccountsServer: defaults to "https://www.meteor.com"                                // 6
MeteorDeveloperAccounts._config = function (options) {                                             // 7
  if (options.developerAccountsServer) {                                                           // 8
    MeteorDeveloperAccounts._server = options.developerAccountsServer;                             // 9
  }                                                                                                // 10
};                                                                                                 // 11
                                                                                                   // 12
/////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                 //
// packages/meteor-developer/template.meteor_developer_configure.js                                //
//                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                   //
                                                                                                   // 1
Template.__checkName("configureLoginServiceDialogForMeteorDeveloper");                             // 2
Template["configureLoginServiceDialogForMeteorDeveloper"] = new Template("Template.configureLoginServiceDialogForMeteorDeveloper", (function() {
  var view = this;                                                                                 // 4
  return [ HTML.Raw("<p>\n    First, you'll need to get a Meteor developer account Client ID.\n    Follow these steps:\n  </p>\n  "), HTML.OL("\n    ", HTML.Raw('<li> Visit <a href="https://www.meteor.com/account-settings" target="_blank">https://www.meteor.com/account-settings</a> and sign in.\n    </li>'), "\n    ", HTML.Raw('<li> Click "New app" in the "Meteor developer account apps" section\n      and give your app a name.</li>'), "\n    ", HTML.LI(" Add\n      ", HTML.SPAN({
    "class": "url"                                                                                 // 6
  }, "\n        ", Blaze.View("lookup:siteUrl", function() {                                       // 7
    return Spacebars.mustache(view.lookup("siteUrl"));                                             // 8
  }), "_oauth/meteor-developer\n      "), "\n      as an Allowed Redirect URL.\n    "), "\n  ") ]; // 9
}));                                                                                               // 10
                                                                                                   // 11
/////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                 //
// packages/meteor-developer/meteor_developer_configure.js                                         //
//                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                   //
Template.configureLoginServiceDialogForMeteorDeveloper.helpers({                                   // 1
  siteUrl: function () {                                                                           // 2
    return Meteor.absoluteUrl();                                                                   // 3
  }                                                                                                // 4
});                                                                                                // 5
                                                                                                   // 6
Template.configureLoginServiceDialogForMeteorDeveloper.fields = function () {                      // 7
  return [                                                                                         // 8
    {property: 'clientId', label: 'App ID'},                                                       // 9
    {property: 'secret', label: 'App secret'}                                                      // 10
  ];                                                                                               // 11
};                                                                                                 // 12
                                                                                                   // 13
/////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                 //
// packages/meteor-developer/meteor_developer_client.js                                            //
//                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                   //
// Request Meteor developer account credentials for the user                                       // 1
// @param credentialRequestCompleteCallback {Function} Callback function to call on                // 2
//   completion. Takes one argument, credentialToken on success, or Error on                       // 3
//   error.                                                                                        // 4
var requestCredential = function (options, credentialRequestCompleteCallback) {                    // 5
  // support a callback without options                                                            // 6
  if (! credentialRequestCompleteCallback && typeof options === "function") {                      // 7
    credentialRequestCompleteCallback = options;                                                   // 8
    options = null;                                                                                // 9
  }                                                                                                // 10
                                                                                                   // 11
  var config = ServiceConfiguration.configurations.findOne({                                       // 12
    service: 'meteor-developer'                                                                    // 13
  });                                                                                              // 14
  if (!config) {                                                                                   // 15
    credentialRequestCompleteCallback &&                                                           // 16
      credentialRequestCompleteCallback(new ServiceConfiguration.ConfigError());                   // 17
    return;                                                                                        // 18
  }                                                                                                // 19
                                                                                                   // 20
  var credentialToken = Random.secret();                                                           // 21
                                                                                                   // 22
  var loginStyle = OAuth._loginStyle('meteor-developer', config, options);                         // 23
                                                                                                   // 24
  var loginUrl =                                                                                   // 25
        MeteorDeveloperAccounts._server +                                                          // 26
        "/oauth2/authorize?" +                                                                     // 27
        "state=" + OAuth._stateParam(loginStyle, credentialToken) +                                // 28
        "&response_type=code&" +                                                                   // 29
        "client_id=" + config.clientId;                                                            // 30
                                                                                                   // 31
  if (options && options.userEmail)                                                                // 32
    loginUrl += '&user_email=' + encodeURIComponent(options.userEmail);                            // 33
                                                                                                   // 34
  loginUrl += "&redirect_uri=" + OAuth._redirectUri('meteor-developer', config);                   // 35
                                                                                                   // 36
  OAuth.launchLogin({                                                                              // 37
    loginService: "meteor-developer",                                                              // 38
    loginStyle: loginStyle,                                                                        // 39
    loginUrl: loginUrl,                                                                            // 40
    credentialRequestCompleteCallback: credentialRequestCompleteCallback,                          // 41
    credentialToken: credentialToken,                                                              // 42
    popupOptions: {width: 470, height: 420}                                                        // 43
  });                                                                                              // 44
};                                                                                                 // 45
                                                                                                   // 46
MeteorDeveloperAccounts.requestCredential = requestCredential;                                     // 47
                                                                                                   // 48
/////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
