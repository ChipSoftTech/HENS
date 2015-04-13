(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                 //
// packages/meetup/meetup_server.js                                                                //
//                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                   //
Meetup = {};                                                                                       // 1
                                                                                                   // 2
OAuth.registerService('meetup', 2, null, function(query) {                                         // 3
                                                                                                   // 4
  var accessToken = getAccessToken(query);                                                         // 5
  var identity = getIdentity(accessToken);                                                         // 6
                                                                                                   // 7
  return {                                                                                         // 8
    serviceData: {                                                                                 // 9
      id: identity.id,                                                                             // 10
      accessToken: accessToken                                                                     // 11
    },                                                                                             // 12
    options: {profile: {name: identity.name}}                                                      // 13
  };                                                                                               // 14
});                                                                                                // 15
                                                                                                   // 16
var getAccessToken = function (query) {                                                            // 17
  var config = ServiceConfiguration.configurations.findOne({service: 'meetup'});                   // 18
  if (!config)                                                                                     // 19
    throw new ServiceConfiguration.ConfigError();                                                  // 20
                                                                                                   // 21
  var response;                                                                                    // 22
  try {                                                                                            // 23
    response = HTTP.post(                                                                          // 24
      "https://secure.meetup.com/oauth2/access", {headers: {Accept: 'application/json'}, params: { // 25
        code: query.code,                                                                          // 26
        client_id: config.clientId,                                                                // 27
        client_secret: OAuth.openSecret(config.secret),                                            // 28
        grant_type: 'authorization_code',                                                          // 29
        redirect_uri: OAuth._redirectUri('meetup', config),                                        // 30
        state: query.state                                                                         // 31
      }});                                                                                         // 32
  } catch (err) {                                                                                  // 33
    throw _.extend(new Error("Failed to complete OAuth handshake with Meetup. " + err.message),    // 34
                   {response: err.response});                                                      // 35
  }                                                                                                // 36
                                                                                                   // 37
  if (response.data.error) { // if the http response was a json object with an error attribute     // 38
    throw new Error("Failed to complete OAuth handshake with Meetup. " + response.data.error);     // 39
  } else {                                                                                         // 40
    return response.data.access_token;                                                             // 41
  }                                                                                                // 42
};                                                                                                 // 43
                                                                                                   // 44
var getIdentity = function (accessToken) {                                                         // 45
  try {                                                                                            // 46
    var response = HTTP.get(                                                                       // 47
      "https://api.meetup.com/2/members",                                                          // 48
      {params: {member_id: 'self', access_token: accessToken}});                                   // 49
    return response.data.results && response.data.results[0];                                      // 50
  } catch (err) {                                                                                  // 51
    throw _.extend(new Error("Failed to fetch identity from Meetup. " + err.message),              // 52
                   {response: err.response});                                                      // 53
  }                                                                                                // 54
};                                                                                                 // 55
                                                                                                   // 56
                                                                                                   // 57
Meetup.retrieveCredential = function(credentialToken, credentialSecret) {                          // 58
  return OAuth.retrieveCredential(credentialToken, credentialSecret);                              // 59
};                                                                                                 // 60
                                                                                                   // 61
/////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
