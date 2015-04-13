(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                             //
// packages/weibo/weibo_server.js                                                              //
//                                                                                             //
/////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                               //
Weibo = {};                                                                                    // 1
                                                                                               // 2
OAuth.registerService('weibo', 2, null, function(query) {                                      // 3
                                                                                               // 4
  var response = getTokenResponse(query);                                                      // 5
  var uid = parseInt(response.uid, 10);                                                        // 6
                                                                                               // 7
  // different parts of weibo's api seem to expect numbers, or strings                         // 8
  // for uid. let's make sure they're both the same.                                           // 9
  if (response.uid !== uid + "")                                                               // 10
    throw new Error("Expected 'uid' to parse to an integer: " + JSON.stringify(response));     // 11
                                                                                               // 12
  var identity = getIdentity(response.access_token, uid);                                      // 13
                                                                                               // 14
  return {                                                                                     // 15
    serviceData: {                                                                             // 16
      // We used to store this as a string, so keep it this way rather than                    // 17
      // add complexity to Account.updateOrCreateUserFromExternalService or                    // 18
      // force a database migration                                                            // 19
      id: uid + "",                                                                            // 20
      accessToken: response.access_token,                                                      // 21
      screenName: identity.screen_name,                                                        // 22
      expiresAt: (+new Date) + (1000 * response.expires_in)                                    // 23
    },                                                                                         // 24
    options: {profile: {name: identity.screen_name}}                                           // 25
  };                                                                                           // 26
});                                                                                            // 27
                                                                                               // 28
// return an object containining:                                                              // 29
// - uid                                                                                       // 30
// - access_token                                                                              // 31
// - expires_in: lifetime of this token in seconds (5 years(!) right now)                      // 32
var getTokenResponse = function (query) {                                                      // 33
  var config = ServiceConfiguration.configurations.findOne({service: 'weibo'});                // 34
  if (!config)                                                                                 // 35
    throw new ServiceConfiguration.ConfigError();                                              // 36
                                                                                               // 37
  var response;                                                                                // 38
  try {                                                                                        // 39
    response = HTTP.post(                                                                      // 40
      "https://api.weibo.com/oauth2/access_token", {params: {                                  // 41
        code: query.code,                                                                      // 42
        client_id: config.clientId,                                                            // 43
        client_secret: OAuth.openSecret(config.secret),                                        // 44
        redirect_uri: OAuth._redirectUri('weibo', config, null, {replaceLocalhost: true}),     // 45
        grant_type: 'authorization_code'                                                       // 46
      }});                                                                                     // 47
  } catch (err) {                                                                              // 48
    throw _.extend(new Error("Failed to complete OAuth handshake with Weibo. " + err.message), // 49
                   {response: err.response});                                                  // 50
  }                                                                                            // 51
                                                                                               // 52
  // result.headers["content-type"] is 'text/plain;charset=UTF-8', so                          // 53
  // the http package doesn't automatically populate result.data                               // 54
  response.data = JSON.parse(response.content);                                                // 55
                                                                                               // 56
  if (response.data.error) { // if the http response was a json object with an error attribute // 57
    throw new Error("Failed to complete OAuth handshake with Weibo. " + response.data.error);  // 58
  } else {                                                                                     // 59
    return response.data;                                                                      // 60
  }                                                                                            // 61
};                                                                                             // 62
                                                                                               // 63
var getIdentity = function (accessToken, userId) {                                             // 64
  try {                                                                                        // 65
    return HTTP.get(                                                                           // 66
      "https://api.weibo.com/2/users/show.json",                                               // 67
      {params: {access_token: accessToken, uid: userId}}).data;                                // 68
  } catch (err) {                                                                              // 69
    throw _.extend(new Error("Failed to fetch identity from Weibo. " + err.message),           // 70
                   {response: err.response});                                                  // 71
  }                                                                                            // 72
};                                                                                             // 73
                                                                                               // 74
Weibo.retrieveCredential = function(credentialToken, credentialSecret) {                       // 75
  return OAuth.retrieveCredential(credentialToken, credentialSecret);                          // 76
};                                                                                             // 77
                                                                                               // 78
/////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
