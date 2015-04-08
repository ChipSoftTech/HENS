(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                               //
// packages/weibo/template.weibo_configure.js                                                    //
//                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                 //
                                                                                                 // 1
Template.__checkName("configureLoginServiceDialogForWeibo");                                     // 2
Template["configureLoginServiceDialogForWeibo"] = new Template("Template.configureLoginServiceDialogForWeibo", (function() {
  var view = this;                                                                               // 4
  return [ HTML.Raw("<p>\n    First, you'll need to register your app on Weibo. Follow these steps:\n  </p>\n  "), HTML.OL("\n    ", HTML.Raw('<li>\n      Visit <a href="http://open.weibo.com/development" target="_blank">http://open.weibo.com/development</a> (Google Chrome\'s automatic translation works well here)\n    </li>'), "\n    ", HTML.Raw('<li>\n      Click the green "创建应用" button\n    </li>'), "\n    ", HTML.Raw("<li>\n      Select 网页应用在第三方网页内访问使用 (Web Applications)\n    </li>"), "\n    ", HTML.Raw("<li>\n      Complete the registration process\n    </li>"), "\n    ", HTML.Raw("<li>\n      Open 应用信息 (Application) -> 高级信息 (Senior Information)\n    </li>"), "\n    ", HTML.LI("\n      Set OAuth2.0 授权回调页 (authorized callback page) to: ", HTML.SPAN({
    "class": "url"                                                                               // 6
  }, Blaze.View("lookup:siteUrl", function() {                                                   // 7
    return Spacebars.mustache(view.lookup("siteUrl"));                                           // 8
  }), "_oauth/weibo"), "\n    "), "\n  ") ];                                                     // 9
}));                                                                                             // 10
                                                                                                 // 11
///////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                               //
// packages/weibo/weibo_configure.js                                                             //
//                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                 //
Template.configureLoginServiceDialogForWeibo.helpers({                                           // 1
  siteUrl: function () {                                                                         // 2
    // Weibo doesn't recognize localhost as a domain                                             // 3
    return Meteor.absoluteUrl({replaceLocalhost: true});                                         // 4
  }                                                                                              // 5
});                                                                                              // 6
                                                                                                 // 7
Template.configureLoginServiceDialogForWeibo.fields = function () {                              // 8
  return [                                                                                       // 9
    {property: 'clientId', label: 'App Key'},                                                    // 10
    {property: 'secret', label: 'App Secret'}                                                    // 11
  ];                                                                                             // 12
};                                                                                               // 13
                                                                                                 // 14
///////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                               //
// packages/weibo/weibo_client.js                                                                //
//                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                 //
Weibo = {};                                                                                      // 1
                                                                                                 // 2
// Request Weibo credentials for the user                                                        // 3
// @param options {optional}                                                                     // 4
// @param credentialRequestCompleteCallback {Function} Callback function to call on              // 5
//   completion. Takes one argument, credentialToken on success, or Error on                     // 6
//   error.                                                                                      // 7
Weibo.requestCredential = function (options, credentialRequestCompleteCallback) {                // 8
  // support both (options, callback) and (callback).                                            // 9
  if (!credentialRequestCompleteCallback && typeof options === 'function') {                     // 10
    credentialRequestCompleteCallback = options;                                                 // 11
    options = {};                                                                                // 12
  }                                                                                              // 13
                                                                                                 // 14
  var config = ServiceConfiguration.configurations.findOne({service: 'weibo'});                  // 15
  if (!config) {                                                                                 // 16
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(                      // 17
      new ServiceConfiguration.ConfigError());                                                   // 18
    return;                                                                                      // 19
  }                                                                                              // 20
                                                                                                 // 21
  var credentialToken = Random.secret();                                                         // 22
                                                                                                 // 23
  var loginStyle = OAuth._loginStyle('weibo', config, options);                                  // 24
                                                                                                 // 25
  // XXX need to support configuring access_type and scope                                       // 26
  var loginUrl =                                                                                 // 27
        'https://api.weibo.com/oauth2/authorize' +                                               // 28
        '?response_type=code' +                                                                  // 29
        '&client_id=' + config.clientId +                                                        // 30
        '&redirect_uri=' + OAuth._redirectUri('weibo', config, null, {replaceLocalhost: true}) + // 31
        '&state=' + OAuth._stateParam(loginStyle, credentialToken);                              // 32
                                                                                                 // 33
  OAuth.launchLogin({                                                                            // 34
    loginService: "weibo",                                                                       // 35
    loginStyle: loginStyle,                                                                      // 36
    loginUrl: loginUrl,                                                                          // 37
    credentialRequestCompleteCallback: credentialRequestCompleteCallback,                        // 38
    credentialToken: credentialToken                                                             // 39
  });                                                                                            // 40
};                                                                                               // 41
                                                                                                 // 42
///////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
