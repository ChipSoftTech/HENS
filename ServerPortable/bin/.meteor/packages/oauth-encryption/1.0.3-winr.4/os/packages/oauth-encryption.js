(function () {

//////////////////////////////////////////////////////////////////////////////////////////
//                                                                                      //
// packages/oauth-encryption/encrypt.js                                                 //
//                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////
                                                                                        //
var crypto = Npm.require("crypto");                                                     // 1
// XXX We hope to be able to use the `crypto` module exclusively when                   // 2
// Node supports GCM in version 0.11.                                                   // 3
var gcm = NpmModuleNodeAesGcm;                                                          // 4
                                                                                        // 5
OAuthEncryption = {};                                                                   // 6
                                                                                        // 7
var gcmKey = null;                                                                      // 8
                                                                                        // 9
                                                                                        // 10
// Node leniently ignores non-base64 characters when parsing a base64                   // 11
// string, but we want to provide a more informative error message if                   // 12
// the developer doesn't use base64 encoding.                                           // 13
//                                                                                      // 14
// Note that an empty string is valid base64 (denoting 0 bytes).                        // 15
//                                                                                      // 16
// Exported for the convenience of tests.                                               // 17
//                                                                                      // 18
OAuthEncryption._isBase64 = function (str) {                                            // 19
  return _.isString(str) && /^[A-Za-z0-9\+\/]*\={0,2}$/.test(str);                      // 20
};                                                                                      // 21
                                                                                        // 22
                                                                                        // 23
// Loads the OAuth secret key, which must be 16 bytes in length                         // 24
// encoded in base64.                                                                   // 25
//                                                                                      // 26
// The key may be `null` which reverts to having no key (mainly used                    // 27
// by tests).                                                                           // 28
//                                                                                      // 29
OAuthEncryption.loadKey = function (key) {                                              // 30
  if (key === null) {                                                                   // 31
    gcmKey = null;                                                                      // 32
    return;                                                                             // 33
  }                                                                                     // 34
                                                                                        // 35
  if (! OAuthEncryption._isBase64(key))                                                 // 36
    throw new Error("The OAuth encryption key must be encoded in base64");              // 37
                                                                                        // 38
  var buf = new Buffer(key, "base64");                                                  // 39
                                                                                        // 40
  if (buf.length !== 16)                                                                // 41
    throw new Error("The OAuth encryption AES-128-GCM key must be 16 bytes in length"); // 42
                                                                                        // 43
  gcmKey = buf;                                                                         // 44
};                                                                                      // 45
                                                                                        // 46
                                                                                        // 47
// Encrypt `data`, which may be any EJSON-compatible object, using the                  // 48
// previously loaded OAuth secret key.                                                  // 49
//                                                                                      // 50
// The `userId` argument is optional. The data is encrypted as { data:                  // 51
// *, userId: * }. When the result of `seal` is passed to `open`, the                   // 52
// same user id must be supplied, which prevents user specific                          // 53
// credentials such as access tokens from being used by a different                     // 54
// user.                                                                                // 55
//                                                                                      // 56
// We would actually like the user id to be AAD (additional                             // 57
// authenticated data), but the node crypto API does not currently have                 // 58
// support for specifying AAD.                                                          // 59
//                                                                                      // 60
OAuthEncryption.seal = function (data, userId) {                                        // 61
  if (! gcmKey) {                                                                       // 62
    throw new Error("No OAuth encryption key loaded");                                  // 63
  }                                                                                     // 64
                                                                                        // 65
  var plaintext = new Buffer(EJSON.stringify({                                          // 66
    data: data,                                                                         // 67
    userId: userId                                                                      // 68
  }));                                                                                  // 69
  var iv = crypto.randomBytes(12);                                                      // 70
  var result = gcm.encrypt(gcmKey, iv, plaintext, new Buffer([]) /* aad */);            // 71
  return {                                                                              // 72
    iv: iv.toString("base64"),                                                          // 73
    ciphertext: result.ciphertext.toString("base64"),                                   // 74
    algorithm: "aes-128-gcm",                                                           // 75
    authTag: result.auth_tag.toString("base64")                                         // 76
  };                                                                                    // 77
};                                                                                      // 78
                                                                                        // 79
// Decrypt the passed ciphertext (as returned from `seal`) using the                    // 80
// previously loaded OAuth secret key.                                                  // 81
//                                                                                      // 82
// `userId` must match the user id passed to `seal`: if the user id                     // 83
// wasn't specified, it must not be specified here, if it was                           // 84
// specified, it must be the same user id.                                              // 85
//                                                                                      // 86
// To prevent an attacker from breaking the encryption key by                           // 87
// observing the result of sending manipulated ciphertexts, `open`                      // 88
// throws "decryption unsuccessful" on any error.                                       // 89
OAuthEncryption.open = function (ciphertext, userId) {                                  // 90
  if (! gcmKey)                                                                         // 91
    throw new Error("No OAuth encryption key loaded");                                  // 92
                                                                                        // 93
  try {                                                                                 // 94
    if (ciphertext.algorithm !== "aes-128-gcm") {                                       // 95
      throw new Error();                                                                // 96
    }                                                                                   // 97
                                                                                        // 98
    var result = gcm.decrypt(                                                           // 99
      gcmKey,                                                                           // 100
      new Buffer(ciphertext.iv, "base64"),                                              // 101
      new Buffer(ciphertext.ciphertext, "base64"),                                      // 102
      new Buffer([]), /* aad */                                                         // 103
      new Buffer(ciphertext.authTag, "base64")                                          // 104
    );                                                                                  // 105
                                                                                        // 106
    if (! result.auth_ok) {                                                             // 107
      throw new Error();                                                                // 108
    }                                                                                   // 109
                                                                                        // 110
    var err;                                                                            // 111
    var data;                                                                           // 112
                                                                                        // 113
    try {                                                                               // 114
      data = EJSON.parse(result.plaintext.toString());                                  // 115
    } catch (e) {                                                                       // 116
      err = new Error();                                                                // 117
    }                                                                                   // 118
                                                                                        // 119
    if (data.userId !== userId) {                                                       // 120
      err = new Error();                                                                // 121
    }                                                                                   // 122
                                                                                        // 123
    if (err) {                                                                          // 124
      throw err;                                                                        // 125
    } else {                                                                            // 126
      return data.data;                                                                 // 127
    }                                                                                   // 128
  } catch (e) {                                                                         // 129
    throw new Error("decryption failed");                                               // 130
  }                                                                                     // 131
};                                                                                      // 132
                                                                                        // 133
                                                                                        // 134
OAuthEncryption.isSealed = function (maybeCipherText) {                                 // 135
  return maybeCipherText &&                                                             // 136
    OAuthEncryption._isBase64(maybeCipherText.iv) &&                                    // 137
    OAuthEncryption._isBase64(maybeCipherText.ciphertext) &&                            // 138
    OAuthEncryption._isBase64(maybeCipherText.authTag) &&                               // 139
    _.isString(maybeCipherText.algorithm);                                              // 140
};                                                                                      // 141
                                                                                        // 142
                                                                                        // 143
OAuthEncryption.keyIsLoaded = function () {                                             // 144
  return !! gcmKey;                                                                     // 145
};                                                                                      // 146
                                                                                        // 147
//////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
