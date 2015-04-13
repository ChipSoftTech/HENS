(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var check = Package.check.check;
var Match = Package.check.Match;
var Random = Package.random.Random;
var EJSON = Package.ejson.EJSON;
var _ = Package.underscore._;
var Tracker = Package.tracker.Tracker;
var Deps = Package.tracker.Deps;
var Log = Package.logging.Log;
var Retry = Package.retry.Retry;
var Hook = Package['callback-hook'].Hook;
var LocalCollection = Package.minimongo.LocalCollection;
var Minimongo = Package.minimongo.Minimongo;

/* Package-scope variables */
var DDP, DDPServer, LivedataTest, toSockjsUrl, toWebsocketUrl, StreamServer, Heartbeat, Server, SUPPORTED_DDP_VERSIONS, MethodInvocation, parseDDP, stringifyDDP, RandomStream, makeRpcSeed, allConnections;

(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp/common.js                                                                                              //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
/**
 * @namespace DDP
 * @summary The namespace for DDP-related methods.
 */
DDP = {};
LivedataTest = {};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp/stream_client_nodejs.js                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// @param endpoint {String} URL to Meteor app
//   "http://subdomain.meteor.com/" or "/" or
//   "ddp+sockjs://foo-**.meteor.com/sockjs"
//
// We do some rewriting of the URL to eventually make it "ws://" or "wss://",
// whatever was passed in.  At the very least, what Meteor.absoluteUrl() returns
// us should work.
//
// We don't do any heartbeating. (The logic that did this in sockjs was removed,
// because it used a built-in sockjs mechanism. We could do it with WebSocket
// ping frames or with DDP-level messages.)
LivedataTest.ClientStream = function (endpoint, options) {
  var self = this;
  options = options || {};

  self.options = _.extend({
    retry: true
  }, options);

  self.client = null;  // created in _launchConnection
  self.endpoint = endpoint;

  self.headers = self.options.headers || {};

  self._initCommon(self.options);

  //// Kickoff!
  self._launchConnection();
};

_.extend(LivedataTest.ClientStream.prototype, {

  // data is a utf8 string. Data sent while not connected is dropped on
  // the floor, and it is up the user of this API to retransmit lost
  // messages on 'reset'
  send: function (data) {
    var self = this;
    if (self.currentStatus.connected) {
      self.client.send(data);
    }
  },

  // Changes where this connection points
  _changeUrl: function (url) {
    var self = this;
    self.endpoint = url;
  },

  _onConnect: function (client) {
    var self = this;

    if (client !== self.client) {
      // This connection is not from the last call to _launchConnection.
      // But _launchConnection calls _cleanup which closes previous connections.
      // It's our belief that this stifles future 'open' events, but maybe
      // we are wrong?
      throw new Error("Got open from inactive client " + !!self.client);
    }

    if (self._forcedToDisconnect) {
      // We were asked to disconnect between trying to open the connection and
      // actually opening it. Let's just pretend this never happened.
      self.client.close();
      self.client = null;
      return;
    }

    if (self.currentStatus.connected) {
      // We already have a connection. It must have been the case that we
      // started two parallel connection attempts (because we wanted to
      // 'reconnect now' on a hanging connection and we had no way to cancel the
      // connection attempt.) But this shouldn't happen (similarly to the client
      // !== self.client check above).
      throw new Error("Two parallel connections?");
    }

    self._clearConnectionTimer();

    // update status
    self.currentStatus.status = "connected";
    self.currentStatus.connected = true;
    self.currentStatus.retryCount = 0;
    self.statusChanged();

    // fire resets. This must come after status change so that clients
    // can call send from within a reset callback.
    _.each(self.eventCallbacks.reset, function (callback) { callback(); });
  },

  _cleanup: function (maybeError) {
    var self = this;

    self._clearConnectionTimer();
    if (self.client) {
      var client = self.client;
      self.client = null;
      client.close();

      _.each(self.eventCallbacks.disconnect, function (callback) {
        callback(maybeError);
      });
    }
  },

  _clearConnectionTimer: function () {
    var self = this;

    if (self.connectionTimer) {
      clearTimeout(self.connectionTimer);
      self.connectionTimer = null;
    }
  },

  _getProxyUrl: function (targetUrl) {
    var self = this;
    // Similar to code in tools/http-helpers.js.
    var proxy = process.env.HTTP_PROXY || process.env.http_proxy || null;
    // if we're going to a secure url, try the https_proxy env variable first.
    if (targetUrl.match(/^wss:/)) {
      proxy = process.env.HTTPS_PROXY || process.env.https_proxy || proxy;
    }
    return proxy;
  },

  _launchConnection: function () {
    var self = this;
    self._cleanup(); // cleanup the old socket, if there was one.

    // Since server-to-server DDP is still an experimental feature, we only
    // require the module if we actually create a server-to-server
    // connection.
    var FayeWebSocket = Npm.require('faye-websocket');

    var targetUrl = toWebsocketUrl(self.endpoint);
    var fayeOptions = { headers: self.headers };
    var proxyUrl = self._getProxyUrl(targetUrl);
    if (proxyUrl) {
      fayeOptions.proxy = { origin: proxyUrl };
    };

    // We would like to specify 'ddp' as the subprotocol here. The npm module we
    // used to use as a client would fail the handshake if we ask for a
    // subprotocol and the server doesn't send one back (and sockjs doesn't).
    // Faye doesn't have that behavior; it's unclear from reading RFC 6455 if
    // Faye is erroneous or not.  So for now, we don't specify protocols.
    var subprotocols = [];

    var client = self.client = new FayeWebSocket.Client(
      targetUrl, subprotocols, fayeOptions);

    self._clearConnectionTimer();
    self.connectionTimer = Meteor.setTimeout(
      function () {
        self._lostConnection(
          new DDP.ConnectionError("DDP connection timed out"));
      },
      self.CONNECT_TIMEOUT);

    self.client.on('open', Meteor.bindEnvironment(function () {
      return self._onConnect(client);
    }, "stream connect callback"));

    var clientOnIfCurrent = function (event, description, f) {
      self.client.on(event, Meteor.bindEnvironment(function () {
        // Ignore events from any connection we've already cleaned up.
        if (client !== self.client)
          return;
        f.apply(this, arguments);
      }, description));
    };

    clientOnIfCurrent('error', 'stream error callback', function (error) {
      if (!self.options._dontPrintErrors)
        Meteor._debug("stream error", error.message);

      // Faye's 'error' object is not a JS error (and among other things,
      // doesn't stringify well). Convert it to one.
      self._lostConnection(new DDP.ConnectionError(error.message));
    });


    clientOnIfCurrent('close', 'stream close callback', function () {
      self._lostConnection();
    });


    clientOnIfCurrent('message', 'stream message callback', function (message) {
      // Ignore binary frames, where message.data is a Buffer
      if (typeof message.data !== "string")
        return;

      _.each(self.eventCallbacks.message, function (callback) {
        callback(message.data);
      });
    });
  }
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp/stream_client_common.js                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// XXX from Underscore.String (http://epeli.github.com/underscore.string/)
var startsWith = function(str, starts) {
  return str.length >= starts.length &&
    str.substring(0, starts.length) === starts;
};
var endsWith = function(str, ends) {
  return str.length >= ends.length &&
    str.substring(str.length - ends.length) === ends;
};

// @param url {String} URL to Meteor app, eg:
//   "/" or "madewith.meteor.com" or "https://foo.meteor.com"
//   or "ddp+sockjs://ddp--****-foo.meteor.com/sockjs"
// @returns {String} URL to the endpoint with the specific scheme and subPath, e.g.
// for scheme "http" and subPath "sockjs"
//   "http://subdomain.meteor.com/sockjs" or "/sockjs"
//   or "https://ddp--1234-foo.meteor.com/sockjs"
var translateUrl =  function(url, newSchemeBase, subPath) {
  if (! newSchemeBase) {
    newSchemeBase = "http";
  }

  var ddpUrlMatch = url.match(/^ddp(i?)\+sockjs:\/\//);
  var httpUrlMatch = url.match(/^http(s?):\/\//);
  var newScheme;
  if (ddpUrlMatch) {
    // Remove scheme and split off the host.
    var urlAfterDDP = url.substr(ddpUrlMatch[0].length);
    newScheme = ddpUrlMatch[1] === "i" ? newSchemeBase : newSchemeBase + "s";
    var slashPos = urlAfterDDP.indexOf('/');
    var host =
          slashPos === -1 ? urlAfterDDP : urlAfterDDP.substr(0, slashPos);
    var rest = slashPos === -1 ? '' : urlAfterDDP.substr(slashPos);

    // In the host (ONLY!), change '*' characters into random digits. This
    // allows different stream connections to connect to different hostnames
    // and avoid browser per-hostname connection limits.
    host = host.replace(/\*/g, function () {
      return Math.floor(Random.fraction()*10);
    });

    return newScheme + '://' + host + rest;
  } else if (httpUrlMatch) {
    newScheme = !httpUrlMatch[1] ? newSchemeBase : newSchemeBase + "s";
    var urlAfterHttp = url.substr(httpUrlMatch[0].length);
    url = newScheme + "://" + urlAfterHttp;
  }

  // Prefix FQDNs but not relative URLs
  if (url.indexOf("://") === -1 && !startsWith(url, "/")) {
    url = newSchemeBase + "://" + url;
  }

  // XXX This is not what we should be doing: if I have a site
  // deployed at "/foo", then DDP.connect("/") should actually connect
  // to "/", not to "/foo". "/" is an absolute path. (Contrast: if
  // deployed at "/foo", it would be reasonable for DDP.connect("bar")
  // to connect to "/foo/bar").
  //
  // We should make this properly honor absolute paths rather than
  // forcing the path to be relative to the site root. Simultaneously,
  // we should set DDP_DEFAULT_CONNECTION_URL to include the site
  // root. See also client_convenience.js #RationalizingRelativeDDPURLs
  url = Meteor._relativeToSiteRootUrl(url);

  if (endsWith(url, "/"))
    return url + subPath;
  else
    return url + "/" + subPath;
};

toSockjsUrl = function (url) {
  return translateUrl(url, "http", "sockjs");
};

toWebsocketUrl = function (url) {
  var ret = translateUrl(url, "ws", "websocket");
  return ret;
};

LivedataTest.toSockjsUrl = toSockjsUrl;


_.extend(LivedataTest.ClientStream.prototype, {

  // Register for callbacks.
  on: function (name, callback) {
    var self = this;

    if (name !== 'message' && name !== 'reset' && name !== 'disconnect')
      throw new Error("unknown event type: " + name);

    if (!self.eventCallbacks[name])
      self.eventCallbacks[name] = [];
    self.eventCallbacks[name].push(callback);
  },


  _initCommon: function (options) {
    var self = this;
    options = options || {};

    //// Constants

    // how long to wait until we declare the connection attempt
    // failed.
    self.CONNECT_TIMEOUT = options.connectTimeoutMs || 10000;

    self.eventCallbacks = {}; // name -> [callback]

    self._forcedToDisconnect = false;

    //// Reactive status
    self.currentStatus = {
      status: "connecting",
      connected: false,
      retryCount: 0
    };


    self.statusListeners = typeof Tracker !== 'undefined' && new Tracker.Dependency;
    self.statusChanged = function () {
      if (self.statusListeners)
        self.statusListeners.changed();
    };

    //// Retry logic
    self._retry = new Retry;
    self.connectionTimer = null;

  },

  // Trigger a reconnect.
  reconnect: function (options) {
    var self = this;
    options = options || {};

    if (options.url) {
      self._changeUrl(options.url);
    }

    if (options._sockjsOptions) {
      self.options._sockjsOptions = options._sockjsOptions;
    }

    if (self.currentStatus.connected) {
      if (options._force || options.url) {
        // force reconnect.
        self._lostConnection(new DDP.ForcedReconnectError);
      } // else, noop.
      return;
    }

    // if we're mid-connection, stop it.
    if (self.currentStatus.status === "connecting") {
      // Pretend it's a clean close.
      self._lostConnection();
    }

    self._retry.clear();
    self.currentStatus.retryCount -= 1; // don't count manual retries
    self._retryNow();
  },

  disconnect: function (options) {
    var self = this;
    options = options || {};

    // Failed is permanent. If we're failed, don't let people go back
    // online by calling 'disconnect' then 'reconnect'.
    if (self._forcedToDisconnect)
      return;

    // If _permanent is set, permanently disconnect a stream. Once a stream
    // is forced to disconnect, it can never reconnect. This is for
    // error cases such as ddp version mismatch, where trying again
    // won't fix the problem.
    if (options._permanent) {
      self._forcedToDisconnect = true;
    }

    self._cleanup();
    self._retry.clear();

    self.currentStatus = {
      status: (options._permanent ? "failed" : "offline"),
      connected: false,
      retryCount: 0
    };

    if (options._permanent && options._error)
      self.currentStatus.reason = options._error;

    self.statusChanged();
  },

  // maybeError is set unless it's a clean protocol-level close.
  _lostConnection: function (maybeError) {
    var self = this;

    self._cleanup(maybeError);
    self._retryLater(maybeError); // sets status. no need to do it here.
  },

  // fired when we detect that we've gone online. try to reconnect
  // immediately.
  _online: function () {
    // if we've requested to be offline by disconnecting, don't reconnect.
    if (this.currentStatus.status != "offline")
      this.reconnect();
  },

  _retryLater: function (maybeError) {
    var self = this;

    var timeout = 0;
    if (self.options.retry ||
        (maybeError && maybeError.errorType === "DDP.ForcedReconnectError")) {
      timeout = self._retry.retryLater(
        self.currentStatus.retryCount,
        _.bind(self._retryNow, self)
      );
      self.currentStatus.status = "waiting";
      self.currentStatus.retryTime = (new Date()).getTime() + timeout;
    } else {
      self.currentStatus.status = "failed";
      delete self.currentStatus.retryTime;
    }

    self.currentStatus.connected = false;
    self.statusChanged();
  },

  _retryNow: function () {
    var self = this;

    if (self._forcedToDisconnect)
      return;

    self.currentStatus.retryCount += 1;
    self.currentStatus.status = "connecting";
    self.currentStatus.connected = false;
    delete self.currentStatus.retryTime;
    self.statusChanged();

    self._launchConnection();
  },


  // Get current status. Reactive.
  status: function () {
    var self = this;
    if (self.statusListeners)
      self.statusListeners.depend();
    return self.currentStatus;
  }
});

DDP.ConnectionError = Meteor.makeErrorType(
  "DDP.ConnectionError", function (message) {
    var self = this;
    self.message = message;
});

DDP.ForcedReconnectError = Meteor.makeErrorType(
  "DDP.ForcedReconnectError", function () {});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp/stream_server.js                                                                                       //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
var url = Npm.require('url');

var pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX ||  "";

StreamServer = function () {
  var self = this;
  self.registration_callbacks = [];
  self.open_sockets = [];

  // Because we are installing directly onto WebApp.httpServer instead of using
  // WebApp.app, we have to process the path prefix ourselves.
  self.prefix = pathPrefix + '/sockjs';
  // routepolicy is only a weak dependency, because we don't need it if we're
  // just doing server-to-server DDP as a client.
  if (Package.routepolicy) {
    Package.routepolicy.RoutePolicy.declare(self.prefix + '/', 'network');
  }

  // set up sockjs
  var sockjs = Npm.require('sockjs');
  var serverOptions = {
    prefix: self.prefix,
    log: function() {},
    // this is the default, but we code it explicitly because we depend
    // on it in stream_client:HEARTBEAT_TIMEOUT
    heartbeat_delay: 45000,
    // The default disconnect_delay is 5 seconds, but if the server ends up CPU
    // bound for that much time, SockJS might not notice that the user has
    // reconnected because the timer (of disconnect_delay ms) can fire before
    // SockJS processes the new connection. Eventually we'll fix this by not
    // combining CPU-heavy processing with SockJS termination (eg a proxy which
    // converts to Unix sockets) but for now, raise the delay.
    disconnect_delay: 60 * 1000,
    // Set the USE_JSESSIONID environment variable to enable setting the
    // JSESSIONID cookie. This is useful for setting up proxies with
    // session affinity.
    jsessionid: !!process.env.USE_JSESSIONID
  };

  // If you know your server environment (eg, proxies) will prevent websockets
  // from ever working, set $DISABLE_WEBSOCKETS and SockJS clients (ie,
  // browsers) will not waste time attempting to use them.
  // (Your server will still have a /websocket endpoint.)
  if (process.env.DISABLE_WEBSOCKETS)
    serverOptions.websocket = false;

  self.server = sockjs.createServer(serverOptions);
  if (!Package.webapp) {
    throw new Error("Cannot create a DDP server without the webapp package");
  }
  // Install the sockjs handlers, but we want to keep around our own particular
  // request handler that adjusts idle timeouts while we have an outstanding
  // request.  This compensates for the fact that sockjs removes all listeners
  // for "request" to add its own.
  Package.webapp.WebApp.httpServer.removeListener('request', Package.webapp.WebApp._timeoutAdjustmentRequestCallback);
  self.server.installHandlers(Package.webapp.WebApp.httpServer);
  Package.webapp.WebApp.httpServer.addListener('request', Package.webapp.WebApp._timeoutAdjustmentRequestCallback);

  // Support the /websocket endpoint
  self._redirectWebsocketEndpoint();

  self.server.on('connection', function (socket) {
    socket.send = function (data) {
      socket.write(data);
    };
    socket.on('close', function () {
      self.open_sockets = _.without(self.open_sockets, socket);
    });
    self.open_sockets.push(socket);

    // XXX COMPAT WITH 0.6.6. Send the old style welcome message, which
    // will force old clients to reload. Remove this once we're not
    // concerned about people upgrading from a pre-0.7.0 release. Also,
    // remove the clause in the client that ignores the welcome message
    // (livedata_connection.js)
    socket.send(JSON.stringify({server_id: "0"}));

    // call all our callbacks when we get a new socket. they will do the
    // work of setting up handlers and such for specific messages.
    _.each(self.registration_callbacks, function (callback) {
      callback(socket);
    });
  });

};

_.extend(StreamServer.prototype, {
  // call my callback when a new socket connects.
  // also call it for all current connections.
  register: function (callback) {
    var self = this;
    self.registration_callbacks.push(callback);
    _.each(self.all_sockets(), function (socket) {
      callback(socket);
    });
  },

  // get a list of all sockets
  all_sockets: function () {
    var self = this;
    return _.values(self.open_sockets);
  },

  // Redirect /websocket to /sockjs/websocket in order to not expose
  // sockjs to clients that want to use raw websockets
  _redirectWebsocketEndpoint: function() {
    var self = this;
    // Unfortunately we can't use a connect middleware here since
    // sockjs installs itself prior to all existing listeners
    // (meaning prior to any connect middlewares) so we need to take
    // an approach similar to overshadowListeners in
    // https://github.com/sockjs/sockjs-node/blob/cf820c55af6a9953e16558555a31decea554f70e/src/utils.coffee
    _.each(['request', 'upgrade'], function(event) {
      var httpServer = Package.webapp.WebApp.httpServer;
      var oldHttpServerListeners = httpServer.listeners(event).slice(0);
      httpServer.removeAllListeners(event);

      // request and upgrade have different arguments passed but
      // we only care about the first one which is always request
      var newListener = function(request /*, moreArguments */) {
        // Store arguments for use within the closure below
        var args = arguments;

        // Rewrite /websocket and /websocket/ urls to /sockjs/websocket while
        // preserving query string.
        var parsedUrl = url.parse(request.url);
        if (parsedUrl.pathname === pathPrefix + '/websocket' ||
            parsedUrl.pathname === pathPrefix + '/websocket/') {
          parsedUrl.pathname = self.prefix + '/websocket';
          request.url = url.format(parsedUrl);
        }
        _.each(oldHttpServerListeners, function(oldListener) {
          oldListener.apply(httpServer, args);
        });
      };
      httpServer.addListener(event, newListener);
    });
  }
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp/heartbeat.js                                                                                           //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// Heartbeat options:
//   heartbeatInterval: interval to send pings, in milliseconds.
//   heartbeatTimeout: timeout to close the connection if a reply isn't
//     received, in milliseconds.
//   sendPing: function to call to send a ping on the connection.
//   onTimeout: function to call to close the connection.

Heartbeat = function (options) {
  var self = this;

  self.heartbeatInterval = options.heartbeatInterval;
  self.heartbeatTimeout = options.heartbeatTimeout;
  self._sendPing = options.sendPing;
  self._onTimeout = options.onTimeout;

  self._heartbeatIntervalHandle = null;
  self._heartbeatTimeoutHandle = null;
};

_.extend(Heartbeat.prototype, {
  stop: function () {
    var self = this;
    self._clearHeartbeatIntervalTimer();
    self._clearHeartbeatTimeoutTimer();
  },

  start: function () {
    var self = this;
    self.stop();
    self._startHeartbeatIntervalTimer();
  },

  _startHeartbeatIntervalTimer: function () {
    var self = this;
    self._heartbeatIntervalHandle = Meteor.setTimeout(
      _.bind(self._heartbeatIntervalFired, self),
      self.heartbeatInterval
    );
  },

  _startHeartbeatTimeoutTimer: function () {
    var self = this;
    self._heartbeatTimeoutHandle = Meteor.setTimeout(
      _.bind(self._heartbeatTimeoutFired, self),
      self.heartbeatTimeout
    );
  },

  _clearHeartbeatIntervalTimer: function () {
    var self = this;
    if (self._heartbeatIntervalHandle) {
      Meteor.clearTimeout(self._heartbeatIntervalHandle);
      self._heartbeatIntervalHandle = null;
    }
  },

  _clearHeartbeatTimeoutTimer: function () {
    var self = this;
    if (self._heartbeatTimeoutHandle) {
      Meteor.clearTimeout(self._heartbeatTimeoutHandle);
      self._heartbeatTimeoutHandle = null;
    }
  },

  // The heartbeat interval timer is fired when we should send a ping.
  _heartbeatIntervalFired: function () {
    var self = this;
    self._heartbeatIntervalHandle = null;
    self._sendPing();
    // Wait for a pong.
    self._startHeartbeatTimeoutTimer();
  },

  // The heartbeat timeout timer is fired when we sent a ping, but we
  // timed out waiting for the pong.
  _heartbeatTimeoutFired: function () {
    var self = this;
    self._heartbeatTimeoutHandle = null;
    self._onTimeout();
  },

  pingReceived: function () {
    var self = this;
    // We know the connection is alive if we receive a ping, so we
    // don't need to send a ping ourselves.  Reset the interval timer.
    if (self._heartbeatIntervalHandle) {
      self._clearHeartbeatIntervalTimer();
      self._startHeartbeatIntervalTimer();
    }
  },

  pongReceived: function () {
    var self = this;

    // Receiving a pong means we won't timeout, so clear the timeout
    // timer and start the interval again.
    if (self._heartbeatTimeoutHandle) {
      self._clearHeartbeatTimeoutTimer();
      self._startHeartbeatIntervalTimer();
    }
  }
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp/livedata_server.js                                                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
DDPServer = {};

var Fiber = Npm.require('fibers');

// This file contains classes:
// * Session - The server's connection to a single DDP client
// * Subscription - A single subscription for a single client
// * Server - An entire server that may talk to > 1 client. A DDP endpoint.
//
// Session and Subscription are file scope. For now, until we freeze
// the interface, Server is package scope (in the future it should be
// exported.)

// Represents a single document in a SessionCollectionView
var SessionDocumentView = function () {
  var self = this;
  self.existsIn = {}; // set of subscriptionHandle
  self.dataByKey = {}; // key-> [ {subscriptionHandle, value} by precedence]
};

_.extend(SessionDocumentView.prototype, {

  getFields: function () {
    var self = this;
    var ret = {};
    _.each(self.dataByKey, function (precedenceList, key) {
      ret[key] = precedenceList[0].value;
    });
    return ret;
  },

  clearField: function (subscriptionHandle, key, changeCollector) {
    var self = this;
    // Publish API ignores _id if present in fields
    if (key === "_id")
      return;
    var precedenceList = self.dataByKey[key];

    // It's okay to clear fields that didn't exist. No need to throw
    // an error.
    if (!precedenceList)
      return;

    var removedValue = undefined;
    for (var i = 0; i < precedenceList.length; i++) {
      var precedence = precedenceList[i];
      if (precedence.subscriptionHandle === subscriptionHandle) {
        // The view's value can only change if this subscription is the one that
        // used to have precedence.
        if (i === 0)
          removedValue = precedence.value;
        precedenceList.splice(i, 1);
        break;
      }
    }
    if (_.isEmpty(precedenceList)) {
      delete self.dataByKey[key];
      changeCollector[key] = undefined;
    } else if (removedValue !== undefined &&
               !EJSON.equals(removedValue, precedenceList[0].value)) {
      changeCollector[key] = precedenceList[0].value;
    }
  },

  changeField: function (subscriptionHandle, key, value,
                         changeCollector, isAdd) {
    var self = this;
    // Publish API ignores _id if present in fields
    if (key === "_id")
      return;

    // Don't share state with the data passed in by the user.
    value = EJSON.clone(value);

    if (!_.has(self.dataByKey, key)) {
      self.dataByKey[key] = [{subscriptionHandle: subscriptionHandle,
                              value: value}];
      changeCollector[key] = value;
      return;
    }
    var precedenceList = self.dataByKey[key];
    var elt;
    if (!isAdd) {
      elt = _.find(precedenceList, function (precedence) {
        return precedence.subscriptionHandle === subscriptionHandle;
      });
    }

    if (elt) {
      if (elt === precedenceList[0] && !EJSON.equals(value, elt.value)) {
        // this subscription is changing the value of this field.
        changeCollector[key] = value;
      }
      elt.value = value;
    } else {
      // this subscription is newly caring about this field
      precedenceList.push({subscriptionHandle: subscriptionHandle, value: value});
    }

  }
});

/**
 * Represents a client's view of a single collection
 * @param {String} collectionName Name of the collection it represents
 * @param {Object.<String, Function>} sessionCallbacks The callbacks for added, changed, removed
 * @class SessionCollectionView
 */
var SessionCollectionView = function (collectionName, sessionCallbacks) {
  var self = this;
  self.collectionName = collectionName;
  self.documents = {};
  self.callbacks = sessionCallbacks;
};

LivedataTest.SessionCollectionView = SessionCollectionView;


_.extend(SessionCollectionView.prototype, {

  isEmpty: function () {
    var self = this;
    return _.isEmpty(self.documents);
  },

  diff: function (previous) {
    var self = this;
    LocalCollection._diffObjects(previous.documents, self.documents, {
      both: _.bind(self.diffDocument, self),

      rightOnly: function (id, nowDV) {
        self.callbacks.added(self.collectionName, id, nowDV.getFields());
      },

      leftOnly: function (id, prevDV) {
        self.callbacks.removed(self.collectionName, id);
      }
    });
  },

  diffDocument: function (id, prevDV, nowDV) {
    var self = this;
    var fields = {};
    LocalCollection._diffObjects(prevDV.getFields(), nowDV.getFields(), {
      both: function (key, prev, now) {
        if (!EJSON.equals(prev, now))
          fields[key] = now;
      },
      rightOnly: function (key, now) {
        fields[key] = now;
      },
      leftOnly: function(key, prev) {
        fields[key] = undefined;
      }
    });
    self.callbacks.changed(self.collectionName, id, fields);
  },

  added: function (subscriptionHandle, id, fields) {
    var self = this;
    var docView = self.documents[id];
    var added = false;
    if (!docView) {
      added = true;
      docView = new SessionDocumentView();
      self.documents[id] = docView;
    }
    docView.existsIn[subscriptionHandle] = true;
    var changeCollector = {};
    _.each(fields, function (value, key) {
      docView.changeField(
        subscriptionHandle, key, value, changeCollector, true);
    });
    if (added)
      self.callbacks.added(self.collectionName, id, changeCollector);
    else
      self.callbacks.changed(self.collectionName, id, changeCollector);
  },

  changed: function (subscriptionHandle, id, changed) {
    var self = this;
    var changedResult = {};
    var docView = self.documents[id];
    if (!docView)
      throw new Error("Could not find element with id " + id + " to change");
    _.each(changed, function (value, key) {
      if (value === undefined)
        docView.clearField(subscriptionHandle, key, changedResult);
      else
        docView.changeField(subscriptionHandle, key, value, changedResult);
    });
    self.callbacks.changed(self.collectionName, id, changedResult);
  },

  removed: function (subscriptionHandle, id) {
    var self = this;
    var docView = self.documents[id];
    if (!docView) {
      var err = new Error("Removed nonexistent document " + id);
      throw err;
    }
    delete docView.existsIn[subscriptionHandle];
    if (_.isEmpty(docView.existsIn)) {
      // it is gone from everyone
      self.callbacks.removed(self.collectionName, id);
      delete self.documents[id];
    } else {
      var changed = {};
      // remove this subscription from every precedence list
      // and record the changes
      _.each(docView.dataByKey, function (precedenceList, key) {
        docView.clearField(subscriptionHandle, key, changed);
      });

      self.callbacks.changed(self.collectionName, id, changed);
    }
  }
});

/******************************************************************************/
/* Session                                                                    */
/******************************************************************************/

var Session = function (server, version, socket, options) {
  var self = this;
  self.id = Random.id();

  self.server = server;
  self.version = version;

  self.initialized = false;
  self.socket = socket;

  // set to null when the session is destroyed. multiple places below
  // use this to determine if the session is alive or not.
  self.inQueue = new Meteor._DoubleEndedQueue();

  self.blocked = false;
  self.workerRunning = false;

  // Sub objects for active subscriptions
  self._namedSubs = {};
  self._universalSubs = [];

  self.userId = null;

  self.collectionViews = {};

  // Set this to false to not send messages when collectionViews are
  // modified. This is done when rerunning subs in _setUserId and those messages
  // are calculated via a diff instead.
  self._isSending = true;

  // If this is true, don't start a newly-created universal publisher on this
  // session. The session will take care of starting it when appropriate.
  self._dontStartNewUniversalSubs = false;

  // when we are rerunning subscriptions, any ready messages
  // we want to buffer up for when we are done rerunning subscriptions
  self._pendingReady = [];

  // List of callbacks to call when this connection is closed.
  self._closeCallbacks = [];


  // XXX HACK: If a sockjs connection, save off the URL. This is
  // temporary and will go away in the near future.
  self._socketUrl = socket.url;

  // Allow tests to disable responding to pings.
  self._respondToPings = options.respondToPings;

  // This object is the public interface to the session. In the public
  // API, it is called the `connection` object.  Internally we call it
  // a `connectionHandle` to avoid ambiguity.
  self.connectionHandle = {
    id: self.id,
    close: function () {
      self.close();
    },
    onClose: function (fn) {
      var cb = Meteor.bindEnvironment(fn, "connection onClose callback");
      if (self.inQueue) {
        self._closeCallbacks.push(cb);
      } else {
        // if we're already closed, call the callback.
        Meteor.defer(cb);
      }
    },
    clientAddress: self._clientAddress(),
    httpHeaders: self.socket.headers
  };

  socket.send(stringifyDDP({msg: 'connected',
                            session: self.id}));
  // On initial connect, spin up all the universal publishers.
  Fiber(function () {
    self.startUniversalSubs();
  }).run();

  if (version !== 'pre1' && options.heartbeatInterval !== 0) {
    self.heartbeat = new Heartbeat({
      heartbeatInterval: options.heartbeatInterval,
      heartbeatTimeout: options.heartbeatTimeout,
      onTimeout: function () {
        self.close();
      },
      sendPing: function () {
        self.send({msg: 'ping'});
      }
    });
    self.heartbeat.start();
  }

  Package.facts && Package.facts.Facts.incrementServerFact(
    "livedata", "sessions", 1);
};

_.extend(Session.prototype, {

  sendReady: function (subscriptionIds) {
    var self = this;
    if (self._isSending)
      self.send({msg: "ready", subs: subscriptionIds});
    else {
      _.each(subscriptionIds, function (subscriptionId) {
        self._pendingReady.push(subscriptionId);
      });
    }
  },

  sendAdded: function (collectionName, id, fields) {
    var self = this;
    if (self._isSending)
      self.send({msg: "added", collection: collectionName, id: id, fields: fields});
  },

  sendChanged: function (collectionName, id, fields) {
    var self = this;
    if (_.isEmpty(fields))
      return;

    if (self._isSending) {
      self.send({
        msg: "changed",
        collection: collectionName,
        id: id,
        fields: fields
      });
    }
  },

  sendRemoved: function (collectionName, id) {
    var self = this;
    if (self._isSending)
      self.send({msg: "removed", collection: collectionName, id: id});
  },

  getSendCallbacks: function () {
    var self = this;
    return {
      added: _.bind(self.sendAdded, self),
      changed: _.bind(self.sendChanged, self),
      removed: _.bind(self.sendRemoved, self)
    };
  },

  getCollectionView: function (collectionName) {
    var self = this;
    if (_.has(self.collectionViews, collectionName)) {
      return self.collectionViews[collectionName];
    }
    var ret = new SessionCollectionView(collectionName,
                                        self.getSendCallbacks());
    self.collectionViews[collectionName] = ret;
    return ret;
  },

  added: function (subscriptionHandle, collectionName, id, fields) {
    var self = this;
    var view = self.getCollectionView(collectionName);
    view.added(subscriptionHandle, id, fields);
  },

  removed: function (subscriptionHandle, collectionName, id) {
    var self = this;
    var view = self.getCollectionView(collectionName);
    view.removed(subscriptionHandle, id);
    if (view.isEmpty()) {
      delete self.collectionViews[collectionName];
    }
  },

  changed: function (subscriptionHandle, collectionName, id, fields) {
    var self = this;
    var view = self.getCollectionView(collectionName);
    view.changed(subscriptionHandle, id, fields);
  },

  startUniversalSubs: function () {
    var self = this;
    // Make a shallow copy of the set of universal handlers and start them. If
    // additional universal publishers start while we're running them (due to
    // yielding), they will run separately as part of Server.publish.
    var handlers = _.clone(self.server.universal_publish_handlers);
    _.each(handlers, function (handler) {
      self._startSubscription(handler);
    });
  },

  // Destroy this session and unregister it at the server.
  close: function () {
    var self = this;

    // Destroy this session, even if it's not registered at the
    // server. Stop all processing and tear everything down. If a socket
    // was attached, close it.

    // Already destroyed.
    if (! self.inQueue)
      return;

    // Drop the merge box data immediately.
    self.inQueue = null;
    self.collectionViews = {};

    if (self.heartbeat) {
      self.heartbeat.stop();
      self.heartbeat = null;
    }

    if (self.socket) {
      self.socket.close();
      self.socket._meteorSession = null;
    }

    Package.facts && Package.facts.Facts.incrementServerFact(
      "livedata", "sessions", -1);

    Meteor.defer(function () {
      // stop callbacks can yield, so we defer this on close.
      // sub._isDeactivated() detects that we set inQueue to null and
      // treats it as semi-deactivated (it will ignore incoming callbacks, etc).
      self._deactivateAllSubscriptions();

      // Defer calling the close callbacks, so that the caller closing
      // the session isn't waiting for all the callbacks to complete.
      _.each(self._closeCallbacks, function (callback) {
        callback();
      });
    });

    // Unregister the session.
    self.server._removeSession(self);
  },

  // Send a message (doing nothing if no socket is connected right now.)
  // It should be a JSON object (it will be stringified.)
  send: function (msg) {
    var self = this;
    if (self.socket) {
      if (Meteor._printSentDDP)
        Meteor._debug("Sent DDP", stringifyDDP(msg));
      self.socket.send(stringifyDDP(msg));
    }
  },

  // Send a connection error.
  sendError: function (reason, offendingMessage) {
    var self = this;
    var msg = {msg: 'error', reason: reason};
    if (offendingMessage)
      msg.offendingMessage = offendingMessage;
    self.send(msg);
  },

  // Process 'msg' as an incoming message. (But as a guard against
  // race conditions during reconnection, ignore the message if
  // 'socket' is not the currently connected socket.)
  //
  // We run the messages from the client one at a time, in the order
  // given by the client. The message handler is passed an idempotent
  // function 'unblock' which it may call to allow other messages to
  // begin running in parallel in another fiber (for example, a method
  // that wants to yield.) Otherwise, it is automatically unblocked
  // when it returns.
  //
  // Actually, we don't have to 'totally order' the messages in this
  // way, but it's the easiest thing that's correct. (unsub needs to
  // be ordered against sub, methods need to be ordered against each
  // other.)
  processMessage: function (msg_in) {
    var self = this;
    if (!self.inQueue) // we have been destroyed.
      return;

    // Respond to ping and pong messages immediately without queuing.
    // If the negotiated DDP version is "pre1" which didn't support
    // pings, preserve the "pre1" behavior of responding with a "bad
    // request" for the unknown messages.
    //
    // Fibers are needed because heartbeat uses Meteor.setTimeout, which
    // needs a Fiber. We could actually use regular setTimeout and avoid
    // these new fibers, but it is easier to just make everything use
    // Meteor.setTimeout and not think too hard.
    if (self.version !== 'pre1' && msg_in.msg === 'ping') {
      if (self._respondToPings)
        self.send({msg: "pong", id: msg_in.id});
      if (self.heartbeat)
        Fiber(function () {
          self.heartbeat.pingReceived();
        }).run();
      return;
    }
    if (self.version !== 'pre1' && msg_in.msg === 'pong') {
      if (self.heartbeat)
        Fiber(function () {
          self.heartbeat.pongReceived();
        }).run();
      return;
    }

    self.inQueue.push(msg_in);
    if (self.workerRunning)
      return;
    self.workerRunning = true;

    var processNext = function () {
      var msg = self.inQueue && self.inQueue.shift();
      if (!msg) {
        self.workerRunning = false;
        return;
      }

      Fiber(function () {
        var blocked = true;

        var unblock = function () {
          if (!blocked)
            return; // idempotent
          blocked = false;
          processNext();
        };

        if (_.has(self.protocol_handlers, msg.msg))
          self.protocol_handlers[msg.msg].call(self, msg, unblock);
        else
          self.sendError('Bad request', msg);
        unblock(); // in case the handler didn't already do it
      }).run();
    };

    processNext();
  },

  protocol_handlers: {
    sub: function (msg) {
      var self = this;

      // reject malformed messages
      if (typeof (msg.id) !== "string" ||
          typeof (msg.name) !== "string" ||
          (('params' in msg) && !(msg.params instanceof Array))) {
        self.sendError("Malformed subscription", msg);
        return;
      }

      if (!self.server.publish_handlers[msg.name]) {
        self.send({
          msg: 'nosub', id: msg.id,
          error: new Meteor.Error(404, "Subscription not found")});
        return;
      }

      if (_.has(self._namedSubs, msg.id))
        // subs are idempotent, or rather, they are ignored if a sub
        // with that id already exists. this is important during
        // reconnect.
        return;

      var handler = self.server.publish_handlers[msg.name];
      self._startSubscription(handler, msg.id, msg.params, msg.name);

    },

    unsub: function (msg) {
      var self = this;

      self._stopSubscription(msg.id);
    },

    method: function (msg, unblock) {
      var self = this;

      // reject malformed messages
      // For now, we silently ignore unknown attributes,
      // for forwards compatibility.
      if (typeof (msg.id) !== "string" ||
          typeof (msg.method) !== "string" ||
          (('params' in msg) && !(msg.params instanceof Array)) ||
          (('randomSeed' in msg) && (typeof msg.randomSeed !== "string"))) {
        self.sendError("Malformed method invocation", msg);
        return;
      }

      var randomSeed = msg.randomSeed || null;

      // set up to mark the method as satisfied once all observers
      // (and subscriptions) have reacted to any writes that were
      // done.
      var fence = new DDPServer._WriteFence;
      fence.onAllCommitted(function () {
        // Retire the fence so that future writes are allowed.
        // This means that callbacks like timers are free to use
        // the fence, and if they fire before it's armed (for
        // example, because the method waits for them) their
        // writes will be included in the fence.
        fence.retire();
        self.send({
          msg: 'updated', methods: [msg.id]});
      });

      // find the handler
      var handler = self.server.method_handlers[msg.method];
      if (!handler) {
        self.send({
          msg: 'result', id: msg.id,
          error: new Meteor.Error(404, "Method not found")});
        fence.arm();
        return;
      }

      var setUserId = function(userId) {
        self._setUserId(userId);
      };

      var invocation = new MethodInvocation({
        isSimulation: false,
        userId: self.userId,
        setUserId: setUserId,
        unblock: unblock,
        connection: self.connectionHandle,
        randomSeed: randomSeed
      });
      try {
        var result = DDPServer._CurrentWriteFence.withValue(fence, function () {
          return DDP._CurrentInvocation.withValue(invocation, function () {
            return maybeAuditArgumentChecks(
              handler, invocation, msg.params, "call to '" + msg.method + "'");
          });
        });
      } catch (e) {
        var exception = e;
      }

      fence.arm(); // we're done adding writes to the fence
      unblock(); // unblock, if the method hasn't done it already

      exception = wrapInternalException(
        exception, "while invoking method '" + msg.method + "'");

      // send response and add to cache
      var payload =
        exception ? {error: exception} : (result !== undefined ?
                                          {result: result} : {});
      self.send(_.extend({msg: 'result', id: msg.id}, payload));
    }
  },

  _eachSub: function (f) {
    var self = this;
    _.each(self._namedSubs, f);
    _.each(self._universalSubs, f);
  },

  _diffCollectionViews: function (beforeCVs) {
    var self = this;
    LocalCollection._diffObjects(beforeCVs, self.collectionViews, {
      both: function (collectionName, leftValue, rightValue) {
        rightValue.diff(leftValue);
      },
      rightOnly: function (collectionName, rightValue) {
        _.each(rightValue.documents, function (docView, id) {
          self.sendAdded(collectionName, id, docView.getFields());
        });
      },
      leftOnly: function (collectionName, leftValue) {
        _.each(leftValue.documents, function (doc, id) {
          self.sendRemoved(collectionName, id);
        });
      }
    });
  },

  // Sets the current user id in all appropriate contexts and reruns
  // all subscriptions
  _setUserId: function(userId) {
    var self = this;

    if (userId !== null && typeof userId !== "string")
      throw new Error("setUserId must be called on string or null, not " +
                      typeof userId);

    // Prevent newly-created universal subscriptions from being added to our
    // session; they will be found below when we call startUniversalSubs.
    //
    // (We don't have to worry about named subscriptions, because we only add
    // them when we process a 'sub' message. We are currently processing a
    // 'method' message, and the method did not unblock, because it is illegal
    // to call setUserId after unblock. Thus we cannot be concurrently adding a
    // new named subscription.)
    self._dontStartNewUniversalSubs = true;

    // Prevent current subs from updating our collectionViews and call their
    // stop callbacks. This may yield.
    self._eachSub(function (sub) {
      sub._deactivate();
    });

    // All subs should now be deactivated. Stop sending messages to the client,
    // save the state of the published collections, reset to an empty view, and
    // update the userId.
    self._isSending = false;
    var beforeCVs = self.collectionViews;
    self.collectionViews = {};
    self.userId = userId;

    // Save the old named subs, and reset to having no subscriptions.
    var oldNamedSubs = self._namedSubs;
    self._namedSubs = {};
    self._universalSubs = [];

    _.each(oldNamedSubs, function (sub, subscriptionId) {
      self._namedSubs[subscriptionId] = sub._recreate();
      // nb: if the handler throws or calls this.error(), it will in fact
      // immediately send its 'nosub'. This is OK, though.
      self._namedSubs[subscriptionId]._runHandler();
    });

    // Allow newly-created universal subs to be started on our connection in
    // parallel with the ones we're spinning up here, and spin up universal
    // subs.
    self._dontStartNewUniversalSubs = false;
    self.startUniversalSubs();

    // Start sending messages again, beginning with the diff from the previous
    // state of the world to the current state. No yields are allowed during
    // this diff, so that other changes cannot interleave.
    Meteor._noYieldsAllowed(function () {
      self._isSending = true;
      self._diffCollectionViews(beforeCVs);
      if (!_.isEmpty(self._pendingReady)) {
        self.sendReady(self._pendingReady);
        self._pendingReady = [];
      }
    });
  },

  _startSubscription: function (handler, subId, params, name) {
    var self = this;

    var sub = new Subscription(
      self, handler, subId, params, name);
    if (subId)
      self._namedSubs[subId] = sub;
    else
      self._universalSubs.push(sub);

    sub._runHandler();
  },

  // tear down specified subscription
  _stopSubscription: function (subId, error) {
    var self = this;

    var subName = null;

    if (subId && self._namedSubs[subId]) {
      subName = self._namedSubs[subId]._name;
      self._namedSubs[subId]._removeAllDocuments();
      self._namedSubs[subId]._deactivate();
      delete self._namedSubs[subId];
    }

    var response = {msg: 'nosub', id: subId};

    if (error) {
      response.error = wrapInternalException(
        error,
        subName ? ("from sub " + subName + " id " + subId)
          : ("from sub id " + subId));
    }

    self.send(response);
  },

  // tear down all subscriptions. Note that this does NOT send removed or nosub
  // messages, since we assume the client is gone.
  _deactivateAllSubscriptions: function () {
    var self = this;

    _.each(self._namedSubs, function (sub, id) {
      sub._deactivate();
    });
    self._namedSubs = {};

    _.each(self._universalSubs, function (sub) {
      sub._deactivate();
    });
    self._universalSubs = [];
  },

  // Determine the remote client's IP address, based on the
  // HTTP_FORWARDED_COUNT environment variable representing how many
  // proxies the server is behind.
  _clientAddress: function () {
    var self = this;

    // For the reported client address for a connection to be correct,
    // the developer must set the HTTP_FORWARDED_COUNT environment
    // variable to an integer representing the number of hops they
    // expect in the `x-forwarded-for` header. E.g., set to "1" if the
    // server is behind one proxy.
    //
    // This could be computed once at startup instead of every time.
    var httpForwardedCount = parseInt(process.env['HTTP_FORWARDED_COUNT']) || 0;

    if (httpForwardedCount === 0)
      return self.socket.remoteAddress;

    var forwardedFor = self.socket.headers["x-forwarded-for"];
    if (! _.isString(forwardedFor))
      return null;
    forwardedFor = forwardedFor.trim().split(/\s*,\s*/);

    // Typically the first value in the `x-forwarded-for` header is
    // the original IP address of the client connecting to the first
    // proxy.  However, the end user can easily spoof the header, in
    // which case the first value(s) will be the fake IP address from
    // the user pretending to be a proxy reporting the original IP
    // address value.  By counting HTTP_FORWARDED_COUNT back from the
    // end of the list, we ensure that we get the IP address being
    // reported by *our* first proxy.

    if (httpForwardedCount < 0 || httpForwardedCount > forwardedFor.length)
      return null;

    return forwardedFor[forwardedFor.length - httpForwardedCount];
  }
});

/******************************************************************************/
/* Subscription                                                               */
/******************************************************************************/

// ctor for a sub handle: the input to each publish function

// Instance name is this because it's usually referred to as this inside a
// publish
/**
 * @summary The server's side of a subscription
 * @class Subscription
 * @instanceName this
 */
var Subscription = function (
    session, handler, subscriptionId, params, name) {
  var self = this;
  self._session = session; // type is Session

  /**
   * @summary Access inside the publish function. The incoming [connection](#meteor_onconnection) for this subscription.
   * @locus Server
   * @name  connection
   * @memberOf Subscription
   * @instance
   */
  self.connection = session.connectionHandle; // public API object

  self._handler = handler;

  // my subscription ID (generated by client, undefined for universal subs).
  self._subscriptionId = subscriptionId;
  // undefined for universal subs
  self._name = name;

  self._params = params || [];

  // Only named subscriptions have IDs, but we need some sort of string
  // internally to keep track of all subscriptions inside
  // SessionDocumentViews. We use this subscriptionHandle for that.
  if (self._subscriptionId) {
    self._subscriptionHandle = 'N' + self._subscriptionId;
  } else {
    self._subscriptionHandle = 'U' + Random.id();
  }

  // has _deactivate been called?
  self._deactivated = false;

  // stop callbacks to g/c this sub.  called w/ zero arguments.
  self._stopCallbacks = [];

  // the set of (collection, documentid) that this subscription has
  // an opinion about
  self._documents = {};

  // remember if we are ready.
  self._ready = false;

  // Part of the public API: the user of this sub.

  /**
   * @summary Access inside the publish function. The id of the logged-in user, or `null` if no user is logged in.
   * @locus Server
   * @memberOf Subscription
   * @name  userId
   * @instance
   */
  self.userId = session.userId;

  // For now, the id filter is going to default to
  // the to/from DDP methods on LocalCollection, to
  // specifically deal with mongo/minimongo ObjectIds.

  // Later, you will be able to make this be "raw"
  // if you want to publish a collection that you know
  // just has strings for keys and no funny business, to
  // a ddp consumer that isn't minimongo

  self._idFilter = {
    idStringify: LocalCollection._idStringify,
    idParse: LocalCollection._idParse
  };

  Package.facts && Package.facts.Facts.incrementServerFact(
    "livedata", "subscriptions", 1);
};

_.extend(Subscription.prototype, {
  _runHandler: function () {
    // XXX should we unblock() here? Either before running the publish
    // function, or before running _publishCursor.
    //
    // Right now, each publish function blocks all future publishes and
    // methods waiting on data from Mongo (or whatever else the function
    // blocks on). This probably slows page load in common cases.

    var self = this;
    try {
      var res = maybeAuditArgumentChecks(
        self._handler, self, EJSON.clone(self._params),
        // It's OK that this would look weird for universal subscriptions,
        // because they have no arguments so there can never be an
        // audit-argument-checks failure.
        "publisher '" + self._name + "'");
    } catch (e) {
      self.error(e);
      return;
    }

    // Did the handler call this.error or this.stop?
    if (self._isDeactivated())
      return;

    // SPECIAL CASE: Instead of writing their own callbacks that invoke
    // this.added/changed/ready/etc, the user can just return a collection
    // cursor or array of cursors from the publish function; we call their
    // _publishCursor method which starts observing the cursor and publishes the
    // results. Note that _publishCursor does NOT call ready().
    //
    // XXX This uses an undocumented interface which only the Mongo cursor
    // interface publishes. Should we make this interface public and encourage
    // users to implement it themselves? Arguably, it's unnecessary; users can
    // already write their own functions like
    //   var publishMyReactiveThingy = function (name, handler) {
    //     Meteor.publish(name, function () {
    //       var reactiveThingy = handler();
    //       reactiveThingy.publishMe();
    //     });
    //   };
    var isCursor = function (c) {
      return c && c._publishCursor;
    };
    if (isCursor(res)) {
      try {
        res._publishCursor(self);
      } catch (e) {
        self.error(e);
        return;
      }
      // _publishCursor only returns after the initial added callbacks have run.
      // mark subscription as ready.
      self.ready();
    } else if (_.isArray(res)) {
      // check all the elements are cursors
      if (! _.all(res, isCursor)) {
        self.error(new Error("Publish function returned an array of non-Cursors"));
        return;
      }
      // find duplicate collection names
      // XXX we should support overlapping cursors, but that would require the
      // merge box to allow overlap within a subscription
      var collectionNames = {};
      for (var i = 0; i < res.length; ++i) {
        var collectionName = res[i]._getCollectionName();
        if (_.has(collectionNames, collectionName)) {
          self.error(new Error(
            "Publish function returned multiple cursors for collection " +
              collectionName));
          return;
        }
        collectionNames[collectionName] = true;
      };

      try {
        _.each(res, function (cur) {
          cur._publishCursor(self);
        });
      } catch (e) {
        self.error(e);
        return;
      }
      self.ready();
    } else if (res) {
      // truthy values other than cursors or arrays are probably a
      // user mistake (possible returning a Mongo document via, say,
      // `coll.findOne()`).
      self.error(new Error("Publish function can only return a Cursor or "
                           + "an array of Cursors"));
    }
  },

  // This calls all stop callbacks and prevents the handler from updating any
  // SessionCollectionViews further. It's used when the user unsubscribes or
  // disconnects, as well as during setUserId re-runs. It does *NOT* send
  // removed messages for the published objects; if that is necessary, call
  // _removeAllDocuments first.
  _deactivate: function() {
    var self = this;
    if (self._deactivated)
      return;
    self._deactivated = true;
    self._callStopCallbacks();
    Package.facts && Package.facts.Facts.incrementServerFact(
      "livedata", "subscriptions", -1);
  },

  _callStopCallbacks: function () {
    var self = this;
    // tell listeners, so they can clean up
    var callbacks = self._stopCallbacks;
    self._stopCallbacks = [];
    _.each(callbacks, function (callback) {
      callback();
    });
  },

  // Send remove messages for every document.
  _removeAllDocuments: function () {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      _.each(self._documents, function(collectionDocs, collectionName) {
        // Iterate over _.keys instead of the dictionary itself, since we'll be
        // mutating it.
        _.each(_.keys(collectionDocs), function (strId) {
          self.removed(collectionName, self._idFilter.idParse(strId));
        });
      });
    });
  },

  // Returns a new Subscription for the same session with the same
  // initial creation parameters. This isn't a clone: it doesn't have
  // the same _documents cache, stopped state or callbacks; may have a
  // different _subscriptionHandle, and gets its userId from the
  // session, not from this object.
  _recreate: function () {
    var self = this;
    return new Subscription(
      self._session, self._handler, self._subscriptionId, self._params,
      self._name);
  },

  /**
   * @summary Call inside the publish function.  Stops this client's subscription, triggering a call on the client to the `onStop` callback passed to [`Meteor.subscribe`](#meteor_subscribe), if any. If `error` is not a [`Meteor.Error`](#meteor_error), it will be [sanitized](#meteor_error).
   * @locus Server
   * @param {Error} error The error to pass to the client.
   * @instance
   * @memberOf Subscription
   */
  error: function (error) {
    var self = this;
    if (self._isDeactivated())
      return;
    self._session._stopSubscription(self._subscriptionId, error);
  },

  // Note that while our DDP client will notice that you've called stop() on the
  // server (and clean up its _subscriptions table) we don't actually provide a
  // mechanism for an app to notice this (the subscribe onError callback only
  // triggers if there is an error).

  /**
   * @summary Call inside the publish function.  Stops this client's subscription and invokes the client's `onStop` callback with no error.
   * @locus Server
   * @instance
   * @memberOf Subscription
   */
  stop: function () {
    var self = this;
    if (self._isDeactivated())
      return;
    self._session._stopSubscription(self._subscriptionId);
  },

  /**
   * @summary Call inside the publish function.  Registers a callback function to run when the subscription is stopped.
   * @locus Server
   * @memberOf Subscription
   * @instance
   * @param {Function} func The callback function
   */
  onStop: function (callback) {
    var self = this;
    if (self._isDeactivated())
      callback();
    else
      self._stopCallbacks.push(callback);
  },

  // This returns true if the sub has been deactivated, *OR* if the session was
  // destroyed but the deferred call to _deactivateAllSubscriptions hasn't
  // happened yet.
  _isDeactivated: function () {
    var self = this;
    return self._deactivated || self._session.inQueue === null;
  },

  /**
   * @summary Call inside the publish function.  Informs the subscriber that a document has been added to the record set.
   * @locus Server
   * @memberOf Subscription
   * @instance
   * @param {String} collection The name of the collection that contains the new document.
   * @param {String} id The new document's ID.
   * @param {Object} fields The fields in the new document.  If `_id` is present it is ignored.
   */
  added: function (collectionName, id, fields) {
    var self = this;
    if (self._isDeactivated())
      return;
    id = self._idFilter.idStringify(id);
    Meteor._ensure(self._documents, collectionName)[id] = true;
    self._session.added(self._subscriptionHandle, collectionName, id, fields);
  },

  /**
   * @summary Call inside the publish function.  Informs the subscriber that a document in the record set has been modified.
   * @locus Server
   * @memberOf Subscription
   * @instance
   * @param {String} collection The name of the collection that contains the changed document.
   * @param {String} id The changed document's ID.
   * @param {Object} fields The fields in the document that have changed, together with their new values.  If a field is not present in `fields` it was left unchanged; if it is present in `fields` and has a value of `undefined` it was removed from the document.  If `_id` is present it is ignored.
   */
  changed: function (collectionName, id, fields) {
    var self = this;
    if (self._isDeactivated())
      return;
    id = self._idFilter.idStringify(id);
    self._session.changed(self._subscriptionHandle, collectionName, id, fields);
  },

  /**
   * @summary Call inside the publish function.  Informs the subscriber that a document has been removed from the record set.
   * @locus Server
   * @memberOf Subscription
   * @instance
   * @param {String} collection The name of the collection that the document has been removed from.
   * @param {String} id The ID of the document that has been removed.
   */
  removed: function (collectionName, id) {
    var self = this;
    if (self._isDeactivated())
      return;
    id = self._idFilter.idStringify(id);
    // We don't bother to delete sets of things in a collection if the
    // collection is empty.  It could break _removeAllDocuments.
    delete self._documents[collectionName][id];
    self._session.removed(self._subscriptionHandle, collectionName, id);
  },

  /**
   * @summary Call inside the publish function.  Informs the subscriber that an initial, complete snapshot of the record set has been sent.  This will trigger a call on the client to the `onReady` callback passed to  [`Meteor.subscribe`](#meteor_subscribe), if any.
   * @locus Server
   * @memberOf Subscription
   * @instance
   */
  ready: function () {
    var self = this;
    if (self._isDeactivated())
      return;
    if (!self._subscriptionId)
      return;  // unnecessary but ignored for universal sub
    if (!self._ready) {
      self._session.sendReady([self._subscriptionId]);
      self._ready = true;
    }
  }
});

/******************************************************************************/
/* Server                                                                     */
/******************************************************************************/

Server = function (options) {
  var self = this;

  // The default heartbeat interval is 30 seconds on the server and 35
  // seconds on the client.  Since the client doesn't need to send a
  // ping as long as it is receiving pings, this means that pings
  // normally go from the server to the client.
  //
  // Note: Troposphere depends on the ability to mutate
  // Meteor.server.options.heartbeatTimeout! This is a hack, but it's life.
  self.options = _.defaults(options || {}, {
    heartbeatInterval: 30000,
    heartbeatTimeout: 15000,
    // For testing, allow responding to pings to be disabled.
    respondToPings: true
  });

  // Map of callbacks to call when a new connection comes in to the
  // server and completes DDP version negotiation. Use an object instead
  // of an array so we can safely remove one from the list while
  // iterating over it.
  self.onConnectionHook = new Hook({
    debugPrintExceptions: "onConnection callback"
  });

  self.publish_handlers = {};
  self.universal_publish_handlers = [];

  self.method_handlers = {};

  self.sessions = {}; // map from id to session

  self.stream_server = new StreamServer;

  self.stream_server.register(function (socket) {
    // socket implements the SockJSConnection interface
    socket._meteorSession = null;

    var sendError = function (reason, offendingMessage) {
      var msg = {msg: 'error', reason: reason};
      if (offendingMessage)
        msg.offendingMessage = offendingMessage;
      socket.send(stringifyDDP(msg));
    };

    socket.on('data', function (raw_msg) {
      if (Meteor._printReceivedDDP) {
        Meteor._debug("Received DDP", raw_msg);
      }
      try {
        try {
          var msg = parseDDP(raw_msg);
        } catch (err) {
          sendError('Parse error');
          return;
        }
        if (msg === null || !msg.msg) {
          sendError('Bad request', msg);
          return;
        }

        if (msg.msg === 'connect') {
          if (socket._meteorSession) {
            sendError("Already connected", msg);
            return;
          }
          Fiber(function () {
            self._handleConnect(socket, msg);
          }).run();
          return;
        }

        if (!socket._meteorSession) {
          sendError('Must connect first', msg);
          return;
        }
        socket._meteorSession.processMessage(msg);
      } catch (e) {
        // XXX print stack nicely
        Meteor._debug("Internal exception while processing message", msg,
                      e.message, e.stack);
      }
    });

    socket.on('close', function () {
      if (socket._meteorSession) {
        Fiber(function () {
          socket._meteorSession.close();
        }).run();
      }
    });
  });
};

_.extend(Server.prototype, {

  /**
   * @summary Register a callback to be called when a new DDP connection is made to the server.
   * @locus Server
   * @param {function} callback The function to call when a new DDP connection is established.
   * @memberOf Meteor
   */
  onConnection: function (fn) {
    var self = this;
    return self.onConnectionHook.register(fn);
  },

  _handleConnect: function (socket, msg) {
    var self = this;

    // The connect message must specify a version and an array of supported
    // versions, and it must claim to support what it is proposing.
    if (!(typeof (msg.version) === 'string' &&
          _.isArray(msg.support) &&
          _.all(msg.support, _.isString) &&
          _.contains(msg.support, msg.version))) {
      socket.send(stringifyDDP({msg: 'failed',
                                version: SUPPORTED_DDP_VERSIONS[0]}));
      socket.close();
      return;
    }

    // In the future, handle session resumption: something like:
    //  socket._meteorSession = self.sessions[msg.session]
    var version = calculateVersion(msg.support, SUPPORTED_DDP_VERSIONS);

    if (msg.version !== version) {
      // The best version to use (according to the client's stated preferences)
      // is not the one the client is trying to use. Inform them about the best
      // version to use.
      socket.send(stringifyDDP({msg: 'failed', version: version}));
      socket.close();
      return;
    }

    // Yay, version matches! Create a new session.
    // Note: Troposphere depends on the ability to mutate
    // Meteor.server.options.heartbeatTimeout! This is a hack, but it's life.
    socket._meteorSession = new Session(self, version, socket, self.options);
    self.sessions[socket._meteorSession.id] = socket._meteorSession;
    self.onConnectionHook.each(function (callback) {
      if (socket._meteorSession)
        callback(socket._meteorSession.connectionHandle);
      return true;
    });
  },
  /**
   * Register a publish handler function.
   *
   * @param name {String} identifier for query
   * @param handler {Function} publish handler
   * @param options {Object}
   *
   * Server will call handler function on each new subscription,
   * either when receiving DDP sub message for a named subscription, or on
   * DDP connect for a universal subscription.
   *
   * If name is null, this will be a subscription that is
   * automatically established and permanently on for all connected
   * client, instead of a subscription that can be turned on and off
   * with subscribe().
   *
   * options to contain:
   *  - (mostly internal) is_auto: true if generated automatically
   *    from an autopublish hook. this is for cosmetic purposes only
   *    (it lets us determine whether to print a warning suggesting
   *    that you turn off autopublish.)
   */

  /**
   * @summary Publish a record set.
   * @memberOf Meteor
   * @locus Server
   * @param {String} name Name of the record set.  If `null`, the set has no name, and the record set is automatically sent to all connected clients.
   * @param {Function} func Function called on the server each time a client subscribes.  Inside the function, `this` is the publish handler object, described below.  If the client passed arguments to `subscribe`, the function is called with the same arguments.
   */
  publish: function (name, handler, options) {
    var self = this;

    options = options || {};

    if (name && name in self.publish_handlers) {
      Meteor._debug("Ignoring duplicate publish named '" + name + "'");
      return;
    }

    if (Package.autopublish && !options.is_auto) {
      // They have autopublish on, yet they're trying to manually
      // picking stuff to publish. They probably should turn off
      // autopublish. (This check isn't perfect -- if you create a
      // publish before you turn on autopublish, it won't catch
      // it. But this will definitely handle the simple case where
      // you've added the autopublish package to your app, and are
      // calling publish from your app code.)
      if (!self.warned_about_autopublish) {
        self.warned_about_autopublish = true;
        Meteor._debug(
"** You've set up some data subscriptions with Meteor.publish(), but\n" +
"** you still have autopublish turned on. Because autopublish is still\n" +
"** on, your Meteor.publish() calls won't have much effect. All data\n" +
"** will still be sent to all clients.\n" +
"**\n" +
"** Turn off autopublish by removing the autopublish package:\n" +
"**\n" +
"**   $ meteor remove autopublish\n" +
"**\n" +
"** .. and make sure you have Meteor.publish() and Meteor.subscribe() calls\n" +
"** for each collection that you want clients to see.\n");
      }
    }

    if (name)
      self.publish_handlers[name] = handler;
    else {
      self.universal_publish_handlers.push(handler);
      // Spin up the new publisher on any existing session too. Run each
      // session's subscription in a new Fiber, so that there's no change for
      // self.sessions to change while we're running this loop.
      _.each(self.sessions, function (session) {
        if (!session._dontStartNewUniversalSubs) {
          Fiber(function() {
            session._startSubscription(handler);
          }).run();
        }
      });
    }
  },

  _removeSession: function (session) {
    var self = this;
    if (self.sessions[session.id]) {
      delete self.sessions[session.id];
    }
  },

  /**
   * @summary Defines functions that can be invoked over the network by clients.
   * @locus Anywhere
   * @param {Object} methods Dictionary whose keys are method names and values are functions.
   * @memberOf Meteor
   */
  methods: function (methods) {
    var self = this;
    _.each(methods, function (func, name) {
      if (self.method_handlers[name])
        throw new Error("A method named '" + name + "' is already defined");
      self.method_handlers[name] = func;
    });
  },

  call: function (name /*, arguments */) {
    // if it's a function, the last argument is the result callback,
    // not a parameter to the remote method.
    var args = Array.prototype.slice.call(arguments, 1);
    if (args.length && typeof args[args.length - 1] === "function")
      var callback = args.pop();
    return this.apply(name, args, callback);
  },

  // @param options {Optional Object}
  // @param callback {Optional Function}
  apply: function (name, args, options, callback) {
    var self = this;

    // We were passed 3 arguments. They may be either (name, args, options)
    // or (name, args, callback)
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }
    options = options || {};

    if (callback)
      // It's not really necessary to do this, since we immediately
      // run the callback in this fiber before returning, but we do it
      // anyway for regularity.
      // XXX improve error message (and how we report it)
      callback = Meteor.bindEnvironment(
        callback,
        "delivering result of invoking '" + name + "'"
      );

    // Run the handler
    var handler = self.method_handlers[name];
    var exception;
    if (!handler) {
      exception = new Meteor.Error(404, "Method not found");
    } else {
      // If this is a method call from within another method, get the
      // user state from the outer method, otherwise don't allow
      // setUserId to be called
      var userId = null;
      var setUserId = function() {
        throw new Error("Can't call setUserId on a server initiated method call");
      };
      var connection = null;
      var currentInvocation = DDP._CurrentInvocation.get();
      if (currentInvocation) {
        userId = currentInvocation.userId;
        setUserId = function(userId) {
          currentInvocation.setUserId(userId);
        };
        connection = currentInvocation.connection;
      }

      var invocation = new MethodInvocation({
        isSimulation: false,
        userId: userId,
        setUserId: setUserId,
        connection: connection,
        randomSeed: makeRpcSeed(currentInvocation, name)
      });
      try {
        var result = DDP._CurrentInvocation.withValue(invocation, function () {
          return maybeAuditArgumentChecks(
            handler, invocation, EJSON.clone(args), "internal call to '" +
              name + "'");
        });
        result = EJSON.clone(result);
      } catch (e) {
        exception = e;
      }
    }

    // Return the result in whichever way the caller asked for it. Note that we
    // do NOT block on the write fence in an analogous way to how the client
    // blocks on the relevant data being visible, so you are NOT guaranteed that
    // cursor observe callbacks have fired when your callback is invoked. (We
    // can change this if there's a real use case.)
    if (callback) {
      callback(exception, result);
      return undefined;
    }
    if (exception)
      throw exception;
    return result;
  },

  _urlForSession: function (sessionId) {
    var self = this;
    var session = self.sessions[sessionId];
    if (session)
      return session._socketUrl;
    else
      return null;
  }
});

var calculateVersion = function (clientSupportedVersions,
                                 serverSupportedVersions) {
  var correctVersion = _.find(clientSupportedVersions, function (version) {
    return _.contains(serverSupportedVersions, version);
  });
  if (!correctVersion) {
    correctVersion = serverSupportedVersions[0];
  }
  return correctVersion;
};

LivedataTest.calculateVersion = calculateVersion;


// "blind" exceptions other than those that were deliberately thrown to signal
// errors to the client
var wrapInternalException = function (exception, context) {
  if (!exception || exception instanceof Meteor.Error)
    return exception;

  // tests can set the 'expected' flag on an exception so it won't go to the
  // server log
  if (!exception.expected) {
    Meteor._debug("Exception " + context, exception.stack);
    if (exception.sanitizedError) {
      Meteor._debug("Sanitized and reported to the client as:", exception.sanitizedError.message);
      Meteor._debug();
    }
  }

  // Did the error contain more details that could have been useful if caught in
  // server code (or if thrown from non-client-originated code), but also
  // provided a "sanitized" version with more context than 500 Internal server
  // error? Use that.
  if (exception.sanitizedError) {
    if (exception.sanitizedError instanceof Meteor.Error)
      return exception.sanitizedError;
    Meteor._debug("Exception " + context + " provides a sanitizedError that " +
                  "is not a Meteor.Error; ignoring");
  }

  return new Meteor.Error(500, "Internal server error");
};


// Audit argument checks, if the audit-argument-checks package exists (it is a
// weak dependency of this package).
var maybeAuditArgumentChecks = function (f, context, args, description) {
  args = args || [];
  if (Package['audit-argument-checks']) {
    return Match._failIfArgumentsAreNotAllChecked(
      f, context, args, description);
  }
  return f.apply(context, args);
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp/writefence.js                                                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
var path = Npm.require('path');
var Future = Npm.require(path.join('fibers', 'future'));

// A write fence collects a group of writes, and provides a callback
// when all of the writes are fully committed and propagated (all
// observers have been notified of the write and acknowledged it.)
//
DDPServer._WriteFence = function () {
  var self = this;

  self.armed = false;
  self.fired = false;
  self.retired = false;
  self.outstanding_writes = 0;
  self.completion_callbacks = [];
};

// The current write fence. When there is a current write fence, code
// that writes to databases should register their writes with it using
// beginWrite().
//
DDPServer._CurrentWriteFence = new Meteor.EnvironmentVariable;

_.extend(DDPServer._WriteFence.prototype, {
  // Start tracking a write, and return an object to represent it. The
  // object has a single method, committed(). This method should be
  // called when the write is fully committed and propagated. You can
  // continue to add writes to the WriteFence up until it is triggered
  // (calls its callbacks because all writes have committed.)
  beginWrite: function () {
    var self = this;

    if (self.retired)
      return { committed: function () {} };

    if (self.fired)
      throw new Error("fence has already activated -- too late to add writes");

    self.outstanding_writes++;
    var committed = false;
    return {
      committed: function () {
        if (committed)
          throw new Error("committed called twice on the same write");
        committed = true;
        self.outstanding_writes--;
        self._maybeFire();
      }
    };
  },

  // Arm the fence. Once the fence is armed, and there are no more
  // uncommitted writes, it will activate.
  arm: function () {
    var self = this;
    if (self === DDPServer._CurrentWriteFence.get())
      throw Error("Can't arm the current fence");
    self.armed = true;
    self._maybeFire();
  },

  // Register a function to be called when the fence fires.
  onAllCommitted: function (func) {
    var self = this;
    if (self.fired)
      throw new Error("fence has already activated -- too late to " +
                      "add a callback");
    self.completion_callbacks.push(func);
  },

  // Convenience function. Arms the fence, then blocks until it fires.
  armAndWait: function () {
    var self = this;
    var future = new Future;
    self.onAllCommitted(function () {
      future['return']();
    });
    self.arm();
    future.wait();
  },

  _maybeFire: function () {
    var self = this;
    if (self.fired)
      throw new Error("write fence already activated?");
    if (self.armed && !self.outstanding_writes) {
      self.fired = true;
      _.each(self.completion_callbacks, function (f) {f(self);});
      self.completion_callbacks = [];
    }
  },

  // Deactivate this fence so that adding more writes has no effect.
  // The fence must have already fired.
  retire: function () {
    var self = this;
    if (! self.fired)
      throw new Error("Can't retire a fence that hasn't fired.");
    self.retired = true;
  }
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp/crossbar.js                                                                                            //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// A "crossbar" is a class that provides structured notification registration.
// See _match for the definition of how a notification matches a trigger.
// All notifications and triggers must have a string key named 'collection'.

DDPServer._Crossbar = function (options) {
  var self = this;
  options = options || {};

  self.nextId = 1;
  // map from collection name (string) -> listener id -> object. each object has
  // keys 'trigger', 'callback'.
  self.listenersByCollection = {};
  self.factPackage = options.factPackage || "livedata";
  self.factName = options.factName || null;
};

_.extend(DDPServer._Crossbar.prototype, {
  // Listen for notification that match 'trigger'. A notification
  // matches if it has the key-value pairs in trigger as a
  // subset. When a notification matches, call 'callback', passing
  // the actual notification.
  //
  // Returns a listen handle, which is an object with a method
  // stop(). Call stop() to stop listening.
  //
  // XXX It should be legal to call fire() from inside a listen()
  // callback?
  listen: function (trigger, callback) {
    var self = this;
    var id = self.nextId++;

    if (typeof(trigger.collection) !== 'string') {
      throw Error("Trigger lacks collection!");
    }

    var collection = trigger.collection;  // save in case trigger is mutated
    var record = {trigger: EJSON.clone(trigger), callback: callback};
    if (! _.has(self.listenersByCollection, collection)) {
      self.listenersByCollection[collection] = {};
    }
    self.listenersByCollection[collection][id] = record;

    if (self.factName && Package.facts) {
      Package.facts.Facts.incrementServerFact(
        self.factPackage, self.factName, 1);
    }

    return {
      stop: function () {
        if (self.factName && Package.facts) {
          Package.facts.Facts.incrementServerFact(
            self.factPackage, self.factName, -1);
        }
        delete self.listenersByCollection[collection][id];
        if (_.isEmpty(self.listenersByCollection[collection])) {
          delete self.listenersByCollection[collection];
        }
      }
    };
  },

  // Fire the provided 'notification' (an object whose attribute
  // values are all JSON-compatibile) -- inform all matching listeners
  // (registered with listen()).
  //
  // If fire() is called inside a write fence, then each of the
  // listener callbacks will be called inside the write fence as well.
  //
  // The listeners may be invoked in parallel, rather than serially.
  fire: function (notification) {
    var self = this;

    if (typeof(notification.collection) !== 'string') {
      throw Error("Notification lacks collection!");
    }

    if (! _.has(self.listenersByCollection, notification.collection))
      return;

    var listenersForCollection =
          self.listenersByCollection[notification.collection];
    var callbackIds = [];
    _.each(listenersForCollection, function (l, id) {
      if (self._matches(notification, l.trigger)) {
        callbackIds.push(id);
      }
    });

    // Listener callbacks can yield, so we need to first find all the ones that
    // match in a single iteration over self.listenersByCollection (which can't
    // be mutated during this iteration), and then invoke the matching
    // callbacks, checking before each call to ensure they haven't stopped.
    // Note that we don't have to check that
    // self.listenersByCollection[notification.collection] still ===
    // listenersForCollection, because the only way that stops being true is if
    // listenersForCollection first gets reduced down to the empty object (and
    // then never gets increased again).
    _.each(callbackIds, function (id) {
      if (_.has(listenersForCollection, id)) {
        listenersForCollection[id].callback(notification);
      }
    });
  },

  // A notification matches a trigger if all keys that exist in both are equal.
  //
  // Examples:
  //  N:{collection: "C"} matches T:{collection: "C"}
  //    (a non-targeted write to a collection matches a
  //     non-targeted query)
  //  N:{collection: "C", id: "X"} matches T:{collection: "C"}
  //    (a targeted write to a collection matches a non-targeted query)
  //  N:{collection: "C"} matches T:{collection: "C", id: "X"}
  //    (a non-targeted write to a collection matches a
  //     targeted query)
  //  N:{collection: "C", id: "X"} matches T:{collection: "C", id: "X"}
  //    (a targeted write to a collection matches a targeted query targeted
  //     at the same document)
  //  N:{collection: "C", id: "X"} does not match T:{collection: "C", id: "Y"}
  //    (a targeted write to a collection does not match a targeted query
  //     targeted at a different document)
  _matches: function (notification, trigger) {
    // Most notifications that use the crossbar have a string `collection` and
    // maybe an `id` that is a string or ObjectID. We're already dividing up
    // triggers by collection, but let's fast-track "nope, different ID" (and
    // avoid the overly generic EJSON.equals). This makes a noticeable
    // performance difference; see https://github.com/meteor/meteor/pull/3697
    if (typeof(notification.id) === 'string' &&
        typeof(trigger.id) === 'string' &&
        notification.id !== trigger.id) {
      return false;
    }
    if (notification.id instanceof LocalCollection._ObjectID &&
        trigger.id instanceof LocalCollection._ObjectID &&
        ! notification.id.equals(trigger.id)) {
      return false;
    }

    return _.all(trigger, function (triggerValue, key) {
      return !_.has(notification, key) ||
        EJSON.equals(triggerValue, notification[key]);
    });
  }
});

// The "invalidation crossbar" is a specific instance used by the DDP server to
// implement write fence notifications. Listener callbacks on this crossbar
// should call beginWrite on the current write fence before they return, if they
// want to delay the write fence from firing (ie, the DDP method-data-updated
// message from being sent).
DDPServer._InvalidationCrossbar = new DDPServer._Crossbar({
  factName: "invalidation-crossbar-listeners"
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp/livedata_common.js                                                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// All the supported versions (for both the client and server)
// These must be in order of preference; most favored-first
SUPPORTED_DDP_VERSIONS = [ '1', 'pre2', 'pre1' ];

LivedataTest.SUPPORTED_DDP_VERSIONS = SUPPORTED_DDP_VERSIONS;

// Instance name is this because it is usually referred to as this inside a
// method definition
/**
 * @summary The state for a single invocation of a method, referenced by this
 * inside a method definition.
 * @param {Object} options
 * @instanceName this
 */
MethodInvocation = function (options) {
  var self = this;

  // true if we're running not the actual method, but a stub (that is,
  // if we're on a client (which may be a browser, or in the future a
  // server connecting to another server) and presently running a
  // simulation of a server-side method for latency compensation
  // purposes). not currently true except in a client such as a browser,
  // since there's usually no point in running stubs unless you have a
  // zero-latency connection to the user.

  /**
   * @summary Access inside a method invocation.  Boolean value, true if this invocation is a stub.
   * @locus Anywhere
   * @name  isSimulation
   * @memberOf MethodInvocation
   * @instance
   * @type {Boolean}
   */
  this.isSimulation = options.isSimulation;

  // call this function to allow other method invocations (from the
  // same client) to continue running without waiting for this one to
  // complete.
  this._unblock = options.unblock || function () {};
  this._calledUnblock = false;

  // current user id

  /**
   * @summary The id of the user that made this method call, or `null` if no user was logged in.
   * @locus Anywhere
   * @name  userId
   * @memberOf MethodInvocation
   * @instance
   */
  this.userId = options.userId;

  // sets current user id in all appropriate server contexts and
  // reruns subscriptions
  this._setUserId = options.setUserId || function () {};

  // On the server, the connection this method call came in on.

  /**
   * @summary Access inside a method invocation. The [connection](#meteor_onconnection) that this method was received on. `null` if the method is not associated with a connection, eg. a server initiated method call.
   * @locus Server
   * @name  connection
   * @memberOf MethodInvocation
   * @instance
   */
  this.connection = options.connection;

  // The seed for randomStream value generation
  this.randomSeed = options.randomSeed;

  // This is set by RandomStream.get; and holds the random stream state
  this.randomStream = null;
};

_.extend(MethodInvocation.prototype, {
  /**
   * @summary Call inside a method invocation.  Allow subsequent method from this client to begin running in a new fiber.
   * @locus Server
   * @memberOf MethodInvocation
   * @instance
   */
  unblock: function () {
    var self = this;
    self._calledUnblock = true;
    self._unblock();
  },

  /**
   * @summary Set the logged in user.
   * @locus Server
   * @memberOf MethodInvocation
   * @instance
   * @param {String | null} userId The value that should be returned by `userId` on this connection.
   */
  setUserId: function(userId) {
    var self = this;
    if (self._calledUnblock)
      throw new Error("Can't call setUserId in a method after calling unblock");
    self.userId = userId;
    self._setUserId(userId);
  }
});

parseDDP = function (stringMessage) {
  try {
    var msg = JSON.parse(stringMessage);
  } catch (e) {
    Meteor._debug("Discarding message with invalid JSON", stringMessage);
    return null;
  }
  // DDP messages must be objects.
  if (msg === null || typeof msg !== 'object') {
    Meteor._debug("Discarding non-object DDP message", stringMessage);
    return null;
  }

  // massage msg to get it into "abstract ddp" rather than "wire ddp" format.

  // switch between "cleared" rep of unsetting fields and "undefined"
  // rep of same
  if (_.has(msg, 'cleared')) {
    if (!_.has(msg, 'fields'))
      msg.fields = {};
    _.each(msg.cleared, function (clearKey) {
      msg.fields[clearKey] = undefined;
    });
    delete msg.cleared;
  }

  _.each(['fields', 'params', 'result'], function (field) {
    if (_.has(msg, field))
      msg[field] = EJSON._adjustTypesFromJSONValue(msg[field]);
  });

  return msg;
};

stringifyDDP = function (msg) {
  var copy = EJSON.clone(msg);
  // swizzle 'changed' messages from 'fields undefined' rep to 'fields
  // and cleared' rep
  if (_.has(msg, 'fields')) {
    var cleared = [];
    _.each(msg.fields, function (value, key) {
      if (value === undefined) {
        cleared.push(key);
        delete copy.fields[key];
      }
    });
    if (!_.isEmpty(cleared))
      copy.cleared = cleared;
    if (_.isEmpty(copy.fields))
      delete copy.fields;
  }
  // adjust types to basic
  _.each(['fields', 'params', 'result'], function (field) {
    if (_.has(copy, field))
      copy[field] = EJSON._adjustTypesToJSONValue(copy[field]);
  });
  if (msg.id && typeof msg.id !== 'string') {
    throw new Error("Message id is not a string");
  }
  return JSON.stringify(copy);
};

// This is private but it's used in a few places. accounts-base uses
// it to get the current user. accounts-password uses it to stash SRP
// state in the DDP session. Meteor.setTimeout and friends clear
// it. We can probably find a better way to factor this.
DDP._CurrentInvocation = new Meteor.EnvironmentVariable;

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp/random_stream.js                                                                                       //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// RandomStream allows for generation of pseudo-random values, from a seed.
//
// We use this for consistent 'random' numbers across the client and server.
// We want to generate probably-unique IDs on the client, and we ideally want
// the server to generate the same IDs when it executes the method.
//
// For generated values to be the same, we must seed ourselves the same way,
// and we must keep track of the current state of our pseudo-random generators.
// We call this state the scope. By default, we use the current DDP method
// invocation as our scope.  DDP now allows the client to specify a randomSeed.
// If a randomSeed is provided it will be used to seed our random sequences.
// In this way, client and server method calls will generate the same values.
//
// We expose multiple named streams; each stream is independent
// and is seeded differently (but predictably from the name).
// By using multiple streams, we support reordering of requests,
// as long as they occur on different streams.
//
// @param options {Optional Object}
//   seed: Array or value - Seed value(s) for the generator.
//                          If an array, will be used as-is
//                          If a value, will be converted to a single-value array
//                          If omitted, a random array will be used as the seed.
RandomStream = function (options) {
  var self = this;

  this.seed = [].concat(options.seed || randomToken());

  this.sequences = {};
};

// Returns a random string of sufficient length for a random seed.
// This is a placeholder function; a similar function is planned
// for Random itself; when that is added we should remove this function,
// and call Random's randomToken instead.
function randomToken() {
  return Random.hexString(20);
};

// Returns the random stream with the specified name, in the specified scope.
// If scope is null (or otherwise falsey) then we will use Random, which will
// give us as random numbers as possible, but won't produce the same
// values across client and server.
// However, scope will normally be the current DDP method invocation, so
// we'll use the stream with the specified name, and we should get consistent
// values on the client and server sides of a method call.
RandomStream.get = function (scope, name) {
  if (!name) {
    name = "default";
  }
  if (!scope) {
    // There was no scope passed in;
    // the sequence won't actually be reproducible.
    return Random;
  }
  var randomStream = scope.randomStream;
  if (!randomStream) {
    scope.randomStream = randomStream = new RandomStream({
      seed: scope.randomSeed
    });
  }
  return randomStream._sequence(name);
};

// Returns the named sequence of pseudo-random values.
// The scope will be DDP._CurrentInvocation.get(), so the stream will produce
// consistent values for method calls on the client and server.
DDP.randomStream = function (name) {
  var scope = DDP._CurrentInvocation.get();
  return RandomStream.get(scope, name);
};

// Creates a randomSeed for passing to a method call.
// Note that we take enclosing as an argument,
// though we expect it to be DDP._CurrentInvocation.get()
// However, we often evaluate makeRpcSeed lazily, and thus the relevant
// invocation may not be the one currently in scope.
// If enclosing is null, we'll use Random and values won't be repeatable.
makeRpcSeed = function (enclosing, methodName) {
  var stream = RandomStream.get(enclosing, '/rpc/' + methodName);
  return stream.hexString(20);
};

_.extend(RandomStream.prototype, {
  // Get a random sequence with the specified name, creating it if does not exist.
  // New sequences are seeded with the seed concatenated with the name.
  // By passing a seed into Random.create, we use the Alea generator.
  _sequence: function (name) {
    var self = this;

    var sequence = self.sequences[name] || null;
    if (sequence === null) {
      var sequenceSeed = self.seed.concat(name);
      for (var i = 0; i < sequenceSeed.length; i++) {
        if (_.isFunction(sequenceSeed[i])) {
          sequenceSeed[i] = sequenceSeed[i]();
        }
      }
      self.sequences[name] = sequence = Random.createWithSeeds.apply(null, sequenceSeed);
    }
    return sequence;
  }
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp/livedata_connection.js                                                                                 //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
if (Meteor.isServer) {
  var path = Npm.require('path');
  var Fiber = Npm.require('fibers');
  var Future = Npm.require(path.join('fibers', 'future'));
}

// @param url {String|Object} URL to Meteor app,
//   or an object as a test hook (see code)
// Options:
//   reloadWithOutstanding: is it OK to reload if there are outstanding methods?
//   headers: extra headers to send on the websockets connection, for
//     server-to-server DDP only
//   _sockjsOptions: Specifies options to pass through to the sockjs client
//   onDDPNegotiationVersionFailure: callback when version negotiation fails.
//
// XXX There should be a way to destroy a DDP connection, causing all
// outstanding method calls to fail.
//
// XXX Our current way of handling failure and reconnection is great
// for an app (where we want to tolerate being disconnected as an
// expect state, and keep trying forever to reconnect) but cumbersome
// for something like a command line tool that wants to make a
// connection, call a method, and print an error if connection
// fails. We should have better usability in the latter case (while
// still transparently reconnecting if it's just a transient failure
// or the server migrating us).
var Connection = function (url, options) {
  var self = this;
  options = _.extend({
    onConnected: function () {},
    onDDPVersionNegotiationFailure: function (description) {
      Meteor._debug(description);
    },
    heartbeatInterval: 35000,
    heartbeatTimeout: 15000,
    // These options are only for testing.
    reloadWithOutstanding: false,
    supportedDDPVersions: SUPPORTED_DDP_VERSIONS,
    retry: true,
    respondToPings: true
  }, options);

  // If set, called when we reconnect, queuing method calls _before_ the
  // existing outstanding ones. This is the only data member that is part of the
  // public API!
  self.onReconnect = null;

  // as a test hook, allow passing a stream instead of a url.
  if (typeof url === "object") {
    self._stream = url;
  } else {
    self._stream = new LivedataTest.ClientStream(url, {
      retry: options.retry,
      headers: options.headers,
      _sockjsOptions: options._sockjsOptions,
      // Used to keep some tests quiet, or for other cases in which
      // the right thing to do with connection errors is to silently
      // fail (e.g. sending package usage stats). At some point we
      // should have a real API for handling client-stream-level
      // errors.
      _dontPrintErrors: options._dontPrintErrors,
      connectTimeoutMs: options.connectTimeoutMs
    });
  }

  self._lastSessionId = null;
  self._versionSuggestion = null;  // The last proposed DDP version.
  self._version = null;   // The DDP version agreed on by client and server.
  self._stores = {}; // name -> object with methods
  self._methodHandlers = {}; // name -> func
  self._nextMethodId = 1;
  self._supportedDDPVersions = options.supportedDDPVersions;

  self._heartbeatInterval = options.heartbeatInterval;
  self._heartbeatTimeout = options.heartbeatTimeout;

  // Tracks methods which the user has tried to call but which have not yet
  // called their user callback (ie, they are waiting on their result or for all
  // of their writes to be written to the local cache). Map from method ID to
  // MethodInvoker object.
  self._methodInvokers = {};

  // Tracks methods which the user has called but whose result messages have not
  // arrived yet.
  //
  // _outstandingMethodBlocks is an array of blocks of methods. Each block
  // represents a set of methods that can run at the same time. The first block
  // represents the methods which are currently in flight; subsequent blocks
  // must wait for previous blocks to be fully finished before they can be sent
  // to the server.
  //
  // Each block is an object with the following fields:
  // - methods: a list of MethodInvoker objects
  // - wait: a boolean; if true, this block had a single method invoked with
  //         the "wait" option
  //
  // There will never be adjacent blocks with wait=false, because the only thing
  // that makes methods need to be serialized is a wait method.
  //
  // Methods are removed from the first block when their "result" is
  // received. The entire first block is only removed when all of the in-flight
  // methods have received their results (so the "methods" list is empty) *AND*
  // all of the data written by those methods are visible in the local cache. So
  // it is possible for the first block's methods list to be empty, if we are
  // still waiting for some objects to quiesce.
  //
  // Example:
  //  _outstandingMethodBlocks = [
  //    {wait: false, methods: []},
  //    {wait: true, methods: [<MethodInvoker for 'login'>]},
  //    {wait: false, methods: [<MethodInvoker for 'foo'>,
  //                            <MethodInvoker for 'bar'>]}]
  // This means that there were some methods which were sent to the server and
  // which have returned their results, but some of the data written by
  // the methods may not be visible in the local cache. Once all that data is
  // visible, we will send a 'login' method. Once the login method has returned
  // and all the data is visible (including re-running subs if userId changes),
  // we will send the 'foo' and 'bar' methods in parallel.
  self._outstandingMethodBlocks = [];

  // method ID -> array of objects with keys 'collection' and 'id', listing
  // documents written by a given method's stub. keys are associated with
  // methods whose stub wrote at least one document, and whose data-done message
  // has not yet been received.
  self._documentsWrittenByStub = {};
  // collection -> IdMap of "server document" object. A "server document" has:
  // - "document": the version of the document according the
  //   server (ie, the snapshot before a stub wrote it, amended by any changes
  //   received from the server)
  //   It is undefined if we think the document does not exist
  // - "writtenByStubs": a set of method IDs whose stubs wrote to the document
  //   whose "data done" messages have not yet been processed
  self._serverDocuments = {};

  // Array of callbacks to be called after the next update of the local
  // cache. Used for:
  //  - Calling methodInvoker.dataVisible and sub ready callbacks after
  //    the relevant data is flushed.
  //  - Invoking the callbacks of "half-finished" methods after reconnect
  //    quiescence. Specifically, methods whose result was received over the old
  //    connection (so we don't re-send it) but whose data had not been made
  //    visible.
  self._afterUpdateCallbacks = [];

  // In two contexts, we buffer all incoming data messages and then process them
  // all at once in a single update:
  //   - During reconnect, we buffer all data messages until all subs that had
  //     been ready before reconnect are ready again, and all methods that are
  //     active have returned their "data done message"; then
  //   - During the execution of a "wait" method, we buffer all data messages
  //     until the wait method gets its "data done" message. (If the wait method
  //     occurs during reconnect, it doesn't get any special handling.)
  // all data messages are processed in one update.
  //
  // The following fields are used for this "quiescence" process.

  // This buffers the messages that aren't being processed yet.
  self._messagesBufferedUntilQuiescence = [];
  // Map from method ID -> true. Methods are removed from this when their
  // "data done" message is received, and we will not quiesce until it is
  // empty.
  self._methodsBlockingQuiescence = {};
  // map from sub ID -> true for subs that were ready (ie, called the sub
  // ready callback) before reconnect but haven't become ready again yet
  self._subsBeingRevived = {}; // map from sub._id -> true
  // if true, the next data update should reset all stores. (set during
  // reconnect.)
  self._resetStores = false;

  // name -> array of updates for (yet to be created) collections
  self._updatesForUnknownStores = {};
  // if we're blocking a migration, the retry func
  self._retryMigrate = null;

  // metadata for subscriptions.  Map from sub ID to object with keys:
  //   - id
  //   - name
  //   - params
  //   - inactive (if true, will be cleaned up if not reused in re-run)
  //   - ready (has the 'ready' message been received?)
  //   - readyCallback (an optional callback to call when ready)
  //   - errorCallback (an optional callback to call if the sub terminates with
  //                    an error, XXX COMPAT WITH 1.0.3.1)
  //   - stopCallback (an optional callback to call when the sub terminates
  //     for any reason, with an error argument if an error triggered the stop)
  self._subscriptions = {};

  // Reactive userId.
  self._userId = null;
  self._userIdDeps = new Tracker.Dependency;

  // Block auto-reload while we're waiting for method responses.
  if (Meteor.isClient && Package.reload && !options.reloadWithOutstanding) {
    Package.reload.Reload._onMigrate(function (retry) {
      if (!self._readyToMigrate()) {
        if (self._retryMigrate)
          throw new Error("Two migrations in progress?");
        self._retryMigrate = retry;
        return false;
      } else {
        return [true];
      }
    });
  }

  var onMessage = function (raw_msg) {
    try {
      var msg = parseDDP(raw_msg);
    } catch (e) {
      Meteor._debug("Exception while parsing DDP", e);
      return;
    }

    if (msg === null || !msg.msg) {
      // XXX COMPAT WITH 0.6.6. ignore the old welcome message for back
      // compat.  Remove this 'if' once the server stops sending welcome
      // messages (stream_server.js).
      if (! (msg && msg.server_id))
        Meteor._debug("discarding invalid livedata message", msg);
      return;
    }

    if (msg.msg === 'connected') {
      self._version = self._versionSuggestion;
      self._livedata_connected(msg);
      options.onConnected();
    }
    else if (msg.msg == 'failed') {
      if (_.contains(self._supportedDDPVersions, msg.version)) {
        self._versionSuggestion = msg.version;
        self._stream.reconnect({_force: true});
      } else {
        var description =
              "DDP version negotiation failed; server requested version " + msg.version;
        self._stream.disconnect({_permanent: true, _error: description});
        options.onDDPVersionNegotiationFailure(description);
      }
    }
    else if (msg.msg === 'ping') {
      if (options.respondToPings)
        self._send({msg: "pong", id: msg.id});
      if (self._heartbeat)
        self._heartbeat.pingReceived();
    }
    else if (msg.msg === 'pong') {
      if (self._heartbeat) {
        self._heartbeat.pongReceived();
      }
    }
    else if (_.include(['added', 'changed', 'removed', 'ready', 'updated'], msg.msg))
      self._livedata_data(msg);
    else if (msg.msg === 'nosub')
      self._livedata_nosub(msg);
    else if (msg.msg === 'result')
      self._livedata_result(msg);
    else if (msg.msg === 'error')
      self._livedata_error(msg);
    else
      Meteor._debug("discarding unknown livedata message type", msg);
  };

  var onReset = function () {
    // Send a connect message at the beginning of the stream.
    // NOTE: reset is called even on the first connection, so this is
    // the only place we send this message.
    var msg = {msg: 'connect'};
    if (self._lastSessionId)
      msg.session = self._lastSessionId;
    msg.version = self._versionSuggestion || self._supportedDDPVersions[0];
    self._versionSuggestion = msg.version;
    msg.support = self._supportedDDPVersions;
    self._send(msg);

    // Now, to minimize setup latency, go ahead and blast out all of
    // our pending methods ands subscriptions before we've even taken
    // the necessary RTT to know if we successfully reconnected. (1)
    // They're supposed to be idempotent; (2) even if we did
    // reconnect, we're not sure what messages might have gotten lost
    // (in either direction) since we were disconnected (TCP being
    // sloppy about that.)

    // If the current block of methods all got their results (but didn't all get
    // their data visible), discard the empty block now.
    if (! _.isEmpty(self._outstandingMethodBlocks) &&
        _.isEmpty(self._outstandingMethodBlocks[0].methods)) {
      self._outstandingMethodBlocks.shift();
    }

    // Mark all messages as unsent, they have not yet been sent on this
    // connection.
    _.each(self._methodInvokers, function (m) {
      m.sentMessage = false;
    });

    // If an `onReconnect` handler is set, call it first. Go through
    // some hoops to ensure that methods that are called from within
    // `onReconnect` get executed _before_ ones that were originally
    // outstanding (since `onReconnect` is used to re-establish auth
    // certificates)
    if (self.onReconnect)
      self._callOnReconnectAndSendAppropriateOutstandingMethods();
    else
      self._sendOutstandingMethods();

    // add new subscriptions at the end. this way they take effect after
    // the handlers and we don't see flicker.
    _.each(self._subscriptions, function (sub, id) {
      self._send({
        msg: 'sub',
        id: id,
        name: sub.name,
        params: sub.params
      });
    });
  };

  var onDisconnect = function () {
    if (self._heartbeat) {
      self._heartbeat.stop();
      self._heartbeat = null;
    }
  };

  if (Meteor.isServer) {
    self._stream.on('message', Meteor.bindEnvironment(onMessage, Meteor._debug));
    self._stream.on('reset', Meteor.bindEnvironment(onReset, Meteor._debug));
    self._stream.on('disconnect', Meteor.bindEnvironment(onDisconnect, Meteor._debug));
  } else {
    self._stream.on('message', onMessage);
    self._stream.on('reset', onReset);
    self._stream.on('disconnect', onDisconnect);
  }
};

// A MethodInvoker manages sending a method to the server and calling the user's
// callbacks. On construction, it registers itself in the connection's
// _methodInvokers map; it removes itself once the method is fully finished and
// the callback is invoked. This occurs when it has both received a result,
// and the data written by it is fully visible.
var MethodInvoker = function (options) {
  var self = this;

  // Public (within this file) fields.
  self.methodId = options.methodId;
  self.sentMessage = false;

  self._callback = options.callback;
  self._connection = options.connection;
  self._message = options.message;
  self._onResultReceived = options.onResultReceived || function () {};
  self._wait = options.wait;
  self._methodResult = null;
  self._dataVisible = false;

  // Register with the connection.
  self._connection._methodInvokers[self.methodId] = self;
};
_.extend(MethodInvoker.prototype, {
  // Sends the method message to the server. May be called additional times if
  // we lose the connection and reconnect before receiving a result.
  sendMessage: function () {
    var self = this;
    // This function is called before sending a method (including resending on
    // reconnect). We should only (re)send methods where we don't already have a
    // result!
    if (self.gotResult())
      throw new Error("sendingMethod is called on method with result");

    // If we're re-sending it, it doesn't matter if data was written the first
    // time.
    self._dataVisible = false;

    self.sentMessage = true;

    // If this is a wait method, make all data messages be buffered until it is
    // done.
    if (self._wait)
      self._connection._methodsBlockingQuiescence[self.methodId] = true;

    // Actually send the message.
    self._connection._send(self._message);
  },
  // Invoke the callback, if we have both a result and know that all data has
  // been written to the local cache.
  _maybeInvokeCallback: function () {
    var self = this;
    if (self._methodResult && self._dataVisible) {
      // Call the callback. (This won't throw: the callback was wrapped with
      // bindEnvironment.)
      self._callback(self._methodResult[0], self._methodResult[1]);

      // Forget about this method.
      delete self._connection._methodInvokers[self.methodId];

      // Let the connection know that this method is finished, so it can try to
      // move on to the next block of methods.
      self._connection._outstandingMethodFinished();
    }
  },
  // Call with the result of the method from the server. Only may be called
  // once; once it is called, you should not call sendMessage again.
  // If the user provided an onResultReceived callback, call it immediately.
  // Then invoke the main callback if data is also visible.
  receiveResult: function (err, result) {
    var self = this;
    if (self.gotResult())
      throw new Error("Methods should only receive results once");
    self._methodResult = [err, result];
    self._onResultReceived(err, result);
    self._maybeInvokeCallback();
  },
  // Call this when all data written by the method is visible. This means that
  // the method has returns its "data is done" message *AND* all server
  // documents that are buffered at that time have been written to the local
  // cache. Invokes the main callback if the result has been received.
  dataVisible: function () {
    var self = this;
    self._dataVisible = true;
    self._maybeInvokeCallback();
  },
  // True if receiveResult has been called.
  gotResult: function () {
    var self = this;
    return !!self._methodResult;
  }
});

_.extend(Connection.prototype, {
  // 'name' is the name of the data on the wire that should go in the
  // store. 'wrappedStore' should be an object with methods beginUpdate, update,
  // endUpdate, saveOriginals, retrieveOriginals. see Collection for an example.
  registerStore: function (name, wrappedStore) {
    var self = this;

    if (name in self._stores)
      return false;

    // Wrap the input object in an object which makes any store method not
    // implemented by 'store' into a no-op.
    var store = {};
    _.each(['update', 'beginUpdate', 'endUpdate', 'saveOriginals',
            'retrieveOriginals'], function (method) {
              store[method] = function () {
                return (wrappedStore[method]
                        ? wrappedStore[method].apply(wrappedStore, arguments)
                        : undefined);
              };
            });

    self._stores[name] = store;

    var queued = self._updatesForUnknownStores[name];
    if (queued) {
      store.beginUpdate(queued.length, false);
      _.each(queued, function (msg) {
        store.update(msg);
      });
      store.endUpdate();
      delete self._updatesForUnknownStores[name];
    }

    return true;
  },

  /**
   * @memberOf Meteor
   * @summary Subscribe to a record set.  Returns a handle that provides
   * `stop()` and `ready()` methods.
   * @locus Client
   * @param {String} name Name of the subscription.  Matches the name of the
   * server's `publish()` call.
   * @param {Any} [arg1,arg2...] Optional arguments passed to publisher
   * function on server.
   * @param {Function|Object} [callbacks] Optional. May include `onStop`
   * and `onReady` callbacks. If there is an error, it is passed as an
   * argument to `onStop`. If a function is passed instead of an object, it
   * is interpreted as an `onReady` callback.
   */
  subscribe: function (name /* .. [arguments] .. (callback|callbacks) */) {
    var self = this;

    var params = Array.prototype.slice.call(arguments, 1);
    var callbacks = {};
    if (params.length) {
      var lastParam = params[params.length - 1];
      if (_.isFunction(lastParam)) {
        callbacks.onReady = params.pop();
      } else if (lastParam &&
        // XXX COMPAT WITH 1.0.3.1 onError used to exist, but now we use
        // onStop with an error callback instead.
        _.any([lastParam.onReady, lastParam.onError, lastParam.onStop],
          _.isFunction)) {
        callbacks = params.pop();
      }
    }

    // Is there an existing sub with the same name and param, run in an
    // invalidated Computation? This will happen if we are rerunning an
    // existing computation.
    //
    // For example, consider a rerun of:
    //
    //     Tracker.autorun(function () {
    //       Meteor.subscribe("foo", Session.get("foo"));
    //       Meteor.subscribe("bar", Session.get("bar"));
    //     });
    //
    // If "foo" has changed but "bar" has not, we will match the "bar"
    // subcribe to an existing inactive subscription in order to not
    // unsub and resub the subscription unnecessarily.
    //
    // We only look for one such sub; if there are N apparently-identical subs
    // being invalidated, we will require N matching subscribe calls to keep
    // them all active.
    var existing = _.find(self._subscriptions, function (sub) {
      return sub.inactive && sub.name === name &&
        EJSON.equals(sub.params, params);
    });

    var id;
    if (existing) {
      id = existing.id;
      existing.inactive = false; // reactivate

      if (callbacks.onReady) {
        // If the sub is not already ready, replace any ready callback with the
        // one provided now. (It's not really clear what users would expect for
        // an onReady callback inside an autorun; the semantics we provide is
        // that at the time the sub first becomes ready, we call the last
        // onReady callback provided, if any.)
        if (!existing.ready)
          existing.readyCallback = callbacks.onReady;
      }

      // XXX COMPAT WITH 1.0.3.1 we used to have onError but now we call
      // onStop with an optional error argument
      if (callbacks.onError) {
        // Replace existing callback if any, so that errors aren't
        // double-reported.
        existing.errorCallback = callbacks.onError;
      }

      if (callbacks.onStop) {
        existing.stopCallback = callbacks.onStop;
      }
    } else {
      // New sub! Generate an id, save it locally, and send message.
      id = Random.id();
      self._subscriptions[id] = {
        id: id,
        name: name,
        params: EJSON.clone(params),
        inactive: false,
        ready: false,
        readyDeps: new Tracker.Dependency,
        readyCallback: callbacks.onReady,
        // XXX COMPAT WITH 1.0.3.1 #errorCallback
        errorCallback: callbacks.onError,
        stopCallback: callbacks.onStop,
        connection: self,
        remove: function() {
          delete this.connection._subscriptions[this.id];
          this.ready && this.readyDeps.changed();
        },
        stop: function() {
          this.connection._send({msg: 'unsub', id: id});
          this.remove();

          if (callbacks.onStop) {
            callbacks.onStop();
          }
        }
      };
      self._send({msg: 'sub', id: id, name: name, params: params});
    }

    // return a handle to the application.
    var handle = {
      stop: function () {
        if (!_.has(self._subscriptions, id))
          return;

        self._subscriptions[id].stop();
      },
      ready: function () {
        // return false if we've unsubscribed.
        if (!_.has(self._subscriptions, id))
          return false;
        var record = self._subscriptions[id];
        record.readyDeps.depend();
        return record.ready;
      },
      subscriptionId: id
    };

    if (Tracker.active) {
      // We're in a reactive computation, so we'd like to unsubscribe when the
      // computation is invalidated... but not if the rerun just re-subscribes
      // to the same subscription!  When a rerun happens, we use onInvalidate
      // as a change to mark the subscription "inactive" so that it can
      // be reused from the rerun.  If it isn't reused, it's killed from
      // an afterFlush.
      Tracker.onInvalidate(function (c) {
        if (_.has(self._subscriptions, id))
          self._subscriptions[id].inactive = true;

        Tracker.afterFlush(function () {
          if (_.has(self._subscriptions, id) &&
              self._subscriptions[id].inactive)
            handle.stop();
        });
      });
    }

    return handle;
  },

  // options:
  // - onLateError {Function(error)} called if an error was received after the ready event.
  //     (errors received before ready cause an error to be thrown)
  _subscribeAndWait: function (name, args, options) {
    var self = this;
    var f = new Future();
    var ready = false;
    var handle;
    args = args || [];
    args.push({
      onReady: function () {
        ready = true;
        f['return']();
      },
      onError: function (e) {
        if (!ready)
          f['throw'](e);
        else
          options && options.onLateError && options.onLateError(e);
      }
    });

    handle = self.subscribe.apply(self, [name].concat(args));
    f.wait();
    return handle;
  },

  methods: function (methods) {
    var self = this;
    _.each(methods, function (func, name) {
      if (self._methodHandlers[name])
        throw new Error("A method named '" + name + "' is already defined");
      self._methodHandlers[name] = func;
    });
  },

  /**
   * @memberOf Meteor
   * @summary Invokes a method passing any number of arguments.
   * @locus Anywhere
   * @param {String} name Name of method to invoke
   * @param {EJSONable} [arg1,arg2...] Optional method arguments
   * @param {Function} [asyncCallback] Optional callback, which is called asynchronously with the error or result after the method is complete. If not provided, the method runs synchronously if possible (see below).
   */
  call: function (name /* .. [arguments] .. callback */) {
    // if it's a function, the last argument is the result callback,
    // not a parameter to the remote method.
    var args = Array.prototype.slice.call(arguments, 1);
    if (args.length && typeof args[args.length - 1] === "function")
      var callback = args.pop();
    return this.apply(name, args, callback);
  },

  // @param options {Optional Object}
  //   wait: Boolean - Should we wait to call this until all current methods
  //                   are fully finished, and block subsequent method calls
  //                   until this method is fully finished?
  //                   (does not affect methods called from within this method)
  //   onResultReceived: Function - a callback to call as soon as the method
  //                                result is received. the data written by
  //                                the method may not yet be in the cache!
  //   returnStubValue: Boolean - If true then in cases where we would have
  //                              otherwise discarded the stub's return value
  //                              and returned undefined, instead we go ahead
  //                              and return it.  Specifically, this is any
  //                              time other than when (a) we are already
  //                              inside a stub or (b) we are in Node and no
  //                              callback was provided.  Currently we require
  //                              this flag to be explicitly passed to reduce
  //                              the likelihood that stub return values will
  //                              be confused with server return values; we
  //                              may improve this in future.
  // @param callback {Optional Function}

  /**
   * @memberOf Meteor
   * @summary Invoke a method passing an array of arguments.
   * @locus Anywhere
   * @param {String} name Name of method to invoke
   * @param {EJSONable[]} args Method arguments
   * @param {Object} [options]
   * @param {Boolean} options.wait (Client only) If true, don't send this method until all previous method calls have completed, and don't send any subsequent method calls until this one is completed.
   * @param {Function} options.onResultReceived (Client only) This callback is invoked with the error or result of the method (just like `asyncCallback`) as soon as the error or result is available. The local cache may not yet reflect the writes performed by the method.
   * @param {Function} [asyncCallback] Optional callback; same semantics as in [`Meteor.call`](#meteor_call).
   */
  apply: function (name, args, options, callback) {
    var self = this;

    // We were passed 3 arguments. They may be either (name, args, options)
    // or (name, args, callback)
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }
    options = options || {};

    if (callback) {
      // XXX would it be better form to do the binding in stream.on,
      // or caller, instead of here?
      // XXX improve error message (and how we report it)
      callback = Meteor.bindEnvironment(
        callback,
        "delivering result of invoking '" + name + "'"
      );
    }

    // Keep our args safe from mutation (eg if we don't send the message for a
    // while because of a wait method).
    args = EJSON.clone(args);

    // Lazily allocate method ID once we know that it'll be needed.
    var methodId = (function () {
      var id;
      return function () {
        if (id === undefined)
          id = '' + (self._nextMethodId++);
        return id;
      };
    })();

    var enclosing = DDP._CurrentInvocation.get();
    var alreadyInSimulation = enclosing && enclosing.isSimulation;

    // Lazily generate a randomSeed, only if it is requested by the stub.
    // The random streams only have utility if they're used on both the client
    // and the server; if the client doesn't generate any 'random' values
    // then we don't expect the server to generate any either.
    // Less commonly, the server may perform different actions from the client,
    // and may in fact generate values where the client did not, but we don't
    // have any client-side values to match, so even here we may as well just
    // use a random seed on the server.  In that case, we don't pass the
    // randomSeed to save bandwidth, and we don't even generate it to save a
    // bit of CPU and to avoid consuming entropy.
    var randomSeed = null;
    var randomSeedGenerator = function () {
      if (randomSeed === null) {
        randomSeed = makeRpcSeed(enclosing, name);
      }
      return randomSeed;
    };

    // Run the stub, if we have one. The stub is supposed to make some
    // temporary writes to the database to give the user a smooth experience
    // until the actual result of executing the method comes back from the
    // server (whereupon the temporary writes to the database will be reversed
    // during the beginUpdate/endUpdate process.)
    //
    // Normally, we ignore the return value of the stub (even if it is an
    // exception), in favor of the real return value from the server. The
    // exception is if the *caller* is a stub. In that case, we're not going
    // to do a RPC, so we use the return value of the stub as our return
    // value.

    var stub = self._methodHandlers[name];
    if (stub) {
      var setUserId = function(userId) {
        self.setUserId(userId);
      };

      var invocation = new MethodInvocation({
        isSimulation: true,
        userId: self.userId(),
        setUserId: setUserId,
        randomSeed: function () { return randomSeedGenerator(); }
      });

      if (!alreadyInSimulation)
        self._saveOriginals();

      try {
        // Note that unlike in the corresponding server code, we never audit
        // that stubs check() their arguments.
        var stubReturnValue = DDP._CurrentInvocation.withValue(invocation, function () {
          if (Meteor.isServer) {
            // Because saveOriginals and retrieveOriginals aren't reentrant,
            // don't allow stubs to yield.
            return Meteor._noYieldsAllowed(function () {
              // re-clone, so that the stub can't affect our caller's values
              return stub.apply(invocation, EJSON.clone(args));
            });
          } else {
            return stub.apply(invocation, EJSON.clone(args));
          }
        });
      }
      catch (e) {
        var exception = e;
      }

      if (!alreadyInSimulation)
        self._retrieveAndStoreOriginals(methodId());
    }

    // If we're in a simulation, stop and return the result we have,
    // rather than going on to do an RPC. If there was no stub,
    // we'll end up returning undefined.
    if (alreadyInSimulation) {
      if (callback) {
        callback(exception, stubReturnValue);
        return undefined;
      }
      if (exception)
        throw exception;
      return stubReturnValue;
    }

    // If an exception occurred in a stub, and we're ignoring it
    // because we're doing an RPC and want to use what the server
    // returns instead, log it so the developer knows.
    //
    // Tests can set the 'expected' flag on an exception so it won't
    // go to log.
    if (exception && !exception.expected) {
      Meteor._debug("Exception while simulating the effect of invoking '" +
                    name + "'", exception, exception.stack);
    }


    // At this point we're definitely doing an RPC, and we're going to
    // return the value of the RPC to the caller.

    // If the caller didn't give a callback, decide what to do.
    if (!callback) {
      if (Meteor.isClient) {
        // On the client, we don't have fibers, so we can't block. The
        // only thing we can do is to return undefined and discard the
        // result of the RPC. If an error occurred then print the error
        // to the console.
        callback = function (err) {
          err && Meteor._debug("Error invoking Method '" + name + "':",
                               err.message);
        };
      } else {
        // On the server, make the function synchronous. Throw on
        // errors, return on success.
        var future = new Future;
        callback = future.resolver();
      }
    }
    // Send the RPC. Note that on the client, it is important that the
    // stub have finished before we send the RPC, so that we know we have
    // a complete list of which local documents the stub wrote.
    var message = {
      msg: 'method',
      method: name,
      params: args,
      id: methodId()
    };

    // Send the randomSeed only if we used it
    if (randomSeed !== null) {
      message.randomSeed = randomSeed;
    }

    var methodInvoker = new MethodInvoker({
      methodId: methodId(),
      callback: callback,
      connection: self,
      onResultReceived: options.onResultReceived,
      wait: !!options.wait,
      message: message
    });

    if (options.wait) {
      // It's a wait method! Wait methods go in their own block.
      self._outstandingMethodBlocks.push(
        {wait: true, methods: [methodInvoker]});
    } else {
      // Not a wait method. Start a new block if the previous block was a wait
      // block, and add it to the last block of methods.
      if (_.isEmpty(self._outstandingMethodBlocks) ||
          _.last(self._outstandingMethodBlocks).wait)
        self._outstandingMethodBlocks.push({wait: false, methods: []});
      _.last(self._outstandingMethodBlocks).methods.push(methodInvoker);
    }

    // If we added it to the first block, send it out now.
    if (self._outstandingMethodBlocks.length === 1)
      methodInvoker.sendMessage();

    // If we're using the default callback on the server,
    // block waiting for the result.
    if (future) {
      return future.wait();
    }
    return options.returnStubValue ? stubReturnValue : undefined;
  },

  // Before calling a method stub, prepare all stores to track changes and allow
  // _retrieveAndStoreOriginals to get the original versions of changed
  // documents.
  _saveOriginals: function () {
    var self = this;
    _.each(self._stores, function (s) {
      s.saveOriginals();
    });
  },
  // Retrieves the original versions of all documents modified by the stub for
  // method 'methodId' from all stores and saves them to _serverDocuments (keyed
  // by document) and _documentsWrittenByStub (keyed by method ID).
  _retrieveAndStoreOriginals: function (methodId) {
    var self = this;
    if (self._documentsWrittenByStub[methodId])
      throw new Error("Duplicate methodId in _retrieveAndStoreOriginals");

    var docsWritten = [];
    _.each(self._stores, function (s, collection) {
      var originals = s.retrieveOriginals();
      // not all stores define retrieveOriginals
      if (!originals)
        return;
      originals.forEach(function (doc, id) {
        docsWritten.push({collection: collection, id: id});
        if (!_.has(self._serverDocuments, collection))
          self._serverDocuments[collection] = new LocalCollection._IdMap;
        var serverDoc = self._serverDocuments[collection].setDefault(id, {});
        if (serverDoc.writtenByStubs) {
          // We're not the first stub to write this doc. Just add our method ID
          // to the record.
          serverDoc.writtenByStubs[methodId] = true;
        } else {
          // First stub! Save the original value and our method ID.
          serverDoc.document = doc;
          serverDoc.flushCallbacks = [];
          serverDoc.writtenByStubs = {};
          serverDoc.writtenByStubs[methodId] = true;
        }
      });
    });
    if (!_.isEmpty(docsWritten)) {
      self._documentsWrittenByStub[methodId] = docsWritten;
    }
  },

  // This is very much a private function we use to make the tests
  // take up fewer server resources after they complete.
  _unsubscribeAll: function () {
    var self = this;
    _.each(_.clone(self._subscriptions), function (sub, id) {
      // Avoid killing the autoupdate subscription so that developers
      // still get hot code pushes when writing tests.
      //
      // XXX it's a hack to encode knowledge about autoupdate here,
      // but it doesn't seem worth it yet to have a special API for
      // subscriptions to preserve after unit tests.
      if (sub.name !== 'meteor_autoupdate_clientVersions') {
        self._subscriptions[id].stop();
      }
    });
  },

  // Sends the DDP stringification of the given message object
  _send: function (obj) {
    var self = this;
    self._stream.send(stringifyDDP(obj));
  },

  // We detected via DDP-level heartbeats that we've lost the
  // connection.  Unlike `disconnect` or `close`, a lost connection
  // will be automatically retried.
  _lostConnection: function (error) {
    var self = this;
    self._stream._lostConnection(error);
  },

  /**
   * @summary Get the current connection status. A reactive data source.
   * @locus Client
   * @memberOf Meteor
   */
  status: function (/*passthrough args*/) {
    var self = this;
    return self._stream.status.apply(self._stream, arguments);
  },

  /**
   * @summary Force an immediate reconnection attempt if the client is not connected to the server.

  This method does nothing if the client is already connected.
   * @locus Client
   * @memberOf Meteor
   */
  reconnect: function (/*passthrough args*/) {
    var self = this;
    return self._stream.reconnect.apply(self._stream, arguments);
  },

  /**
   * @summary Disconnect the client from the server.
   * @locus Client
   * @memberOf Meteor
   */
  disconnect: function (/*passthrough args*/) {
    var self = this;
    return self._stream.disconnect.apply(self._stream, arguments);
  },

  close: function () {
    var self = this;
    return self._stream.disconnect({_permanent: true});
  },

  ///
  /// Reactive user system
  ///
  userId: function () {
    var self = this;
    if (self._userIdDeps)
      self._userIdDeps.depend();
    return self._userId;
  },

  setUserId: function (userId) {
    var self = this;
    // Avoid invalidating dependents if setUserId is called with current value.
    if (self._userId === userId)
      return;
    self._userId = userId;
    if (self._userIdDeps)
      self._userIdDeps.changed();
  },

  // Returns true if we are in a state after reconnect of waiting for subs to be
  // revived or early methods to finish their data, or we are waiting for a
  // "wait" method to finish.
  _waitingForQuiescence: function () {
    var self = this;
    return (! _.isEmpty(self._subsBeingRevived) ||
            ! _.isEmpty(self._methodsBlockingQuiescence));
  },

  // Returns true if any method whose message has been sent to the server has
  // not yet invoked its user callback.
  _anyMethodsAreOutstanding: function () {
    var self = this;
    return _.any(_.pluck(self._methodInvokers, 'sentMessage'));
  },

  _livedata_connected: function (msg) {
    var self = this;

    if (self._version !== 'pre1' && self._heartbeatInterval !== 0) {
      self._heartbeat = new Heartbeat({
        heartbeatInterval: self._heartbeatInterval,
        heartbeatTimeout: self._heartbeatTimeout,
        onTimeout: function () {
          self._lostConnection(
            new DDP.ConnectionError("DDP heartbeat timed out"));
        },
        sendPing: function () {
          self._send({msg: 'ping'});
        }
      });
      self._heartbeat.start();
    }

    // If this is a reconnect, we'll have to reset all stores.
    if (self._lastSessionId)
      self._resetStores = true;

    if (typeof (msg.session) === "string") {
      var reconnectedToPreviousSession = (self._lastSessionId === msg.session);
      self._lastSessionId = msg.session;
    }

    if (reconnectedToPreviousSession) {
      // Successful reconnection -- pick up where we left off.  Note that right
      // now, this never happens: the server never connects us to a previous
      // session, because DDP doesn't provide enough data for the server to know
      // what messages the client has processed. We need to improve DDP to make
      // this possible, at which point we'll probably need more code here.
      return;
    }

    // Server doesn't have our data any more. Re-sync a new session.

    // Forget about messages we were buffering for unknown collections. They'll
    // be resent if still relevant.
    self._updatesForUnknownStores = {};

    if (self._resetStores) {
      // Forget about the effects of stubs. We'll be resetting all collections
      // anyway.
      self._documentsWrittenByStub = {};
      self._serverDocuments = {};
    }

    // Clear _afterUpdateCallbacks.
    self._afterUpdateCallbacks = [];

    // Mark all named subscriptions which are ready (ie, we already called the
    // ready callback) as needing to be revived.
    // XXX We should also block reconnect quiescence until unnamed subscriptions
    //     (eg, autopublish) are done re-publishing to avoid flicker!
    self._subsBeingRevived = {};
    _.each(self._subscriptions, function (sub, id) {
      if (sub.ready)
        self._subsBeingRevived[id] = true;
    });

    // Arrange for "half-finished" methods to have their callbacks run, and
    // track methods that were sent on this connection so that we don't
    // quiesce until they are all done.
    //
    // Start by clearing _methodsBlockingQuiescence: methods sent before
    // reconnect don't matter, and any "wait" methods sent on the new connection
    // that we drop here will be restored by the loop below.
    self._methodsBlockingQuiescence = {};
    if (self._resetStores) {
      _.each(self._methodInvokers, function (invoker) {
        if (invoker.gotResult()) {
          // This method already got its result, but it didn't call its callback
          // because its data didn't become visible. We did not resend the
          // method RPC. We'll call its callback when we get a full quiesce,
          // since that's as close as we'll get to "data must be visible".
          self._afterUpdateCallbacks.push(_.bind(invoker.dataVisible, invoker));
        } else if (invoker.sentMessage) {
          // This method has been sent on this connection (maybe as a resend
          // from the last connection, maybe from onReconnect, maybe just very
          // quickly before processing the connected message).
          //
          // We don't need to do anything special to ensure its callbacks get
          // called, but we'll count it as a method which is preventing
          // reconnect quiescence. (eg, it might be a login method that was run
          // from onReconnect, and we don't want to see flicker by seeing a
          // logged-out state.)
          self._methodsBlockingQuiescence[invoker.methodId] = true;
        }
      });
    }

    self._messagesBufferedUntilQuiescence = [];

    // If we're not waiting on any methods or subs, we can reset the stores and
    // call the callbacks immediately.
    if (!self._waitingForQuiescence()) {
      if (self._resetStores) {
        _.each(self._stores, function (s) {
          s.beginUpdate(0, true);
          s.endUpdate();
        });
        self._resetStores = false;
      }
      self._runAfterUpdateCallbacks();
    }
  },


  _processOneDataMessage: function (msg, updates) {
    var self = this;
    // Using underscore here so as not to need to capitalize.
    self['_process_' + msg.msg](msg, updates);
  },


  _livedata_data: function (msg) {
    var self = this;

    // collection name -> array of messages
    var updates = {};

    if (self._waitingForQuiescence()) {
      self._messagesBufferedUntilQuiescence.push(msg);

      if (msg.msg === "nosub")
        delete self._subsBeingRevived[msg.id];

      _.each(msg.subs || [], function (subId) {
        delete self._subsBeingRevived[subId];
      });
      _.each(msg.methods || [], function (methodId) {
        delete self._methodsBlockingQuiescence[methodId];
      });

      if (self._waitingForQuiescence())
        return;

      // No methods or subs are blocking quiescence!
      // We'll now process and all of our buffered messages, reset all stores,
      // and apply them all at once.
      _.each(self._messagesBufferedUntilQuiescence, function (bufferedMsg) {
        self._processOneDataMessage(bufferedMsg, updates);
      });
      self._messagesBufferedUntilQuiescence = [];
    } else {
      self._processOneDataMessage(msg, updates);
    }

    if (self._resetStores || !_.isEmpty(updates)) {
      // Begin a transactional update of each store.
      _.each(self._stores, function (s, storeName) {
        s.beginUpdate(_.has(updates, storeName) ? updates[storeName].length : 0,
                      self._resetStores);
      });
      self._resetStores = false;

      _.each(updates, function (updateMessages, storeName) {
        var store = self._stores[storeName];
        if (store) {
          _.each(updateMessages, function (updateMessage) {
            store.update(updateMessage);
          });
        } else {
          // Nobody's listening for this data. Queue it up until
          // someone wants it.
          // XXX memory use will grow without bound if you forget to
          // create a collection or just don't care about it... going
          // to have to do something about that.
          if (!_.has(self._updatesForUnknownStores, storeName))
            self._updatesForUnknownStores[storeName] = [];
          Array.prototype.push.apply(self._updatesForUnknownStores[storeName],
                                     updateMessages);
        }
      });

      // End update transaction.
      _.each(self._stores, function (s) { s.endUpdate(); });
    }

    self._runAfterUpdateCallbacks();
  },

  // Call any callbacks deferred with _runWhenAllServerDocsAreFlushed whose
  // relevant docs have been flushed, as well as dataVisible callbacks at
  // reconnect-quiescence time.
  _runAfterUpdateCallbacks: function () {
    var self = this;
    var callbacks = self._afterUpdateCallbacks;
    self._afterUpdateCallbacks = [];
    _.each(callbacks, function (c) {
      c();
    });
  },

  _pushUpdate: function (updates, collection, msg) {
    var self = this;
    if (!_.has(updates, collection)) {
      updates[collection] = [];
    }
    updates[collection].push(msg);
  },

  _getServerDoc: function (collection, id) {
    var self = this;
    if (!_.has(self._serverDocuments, collection))
      return null;
    var serverDocsForCollection = self._serverDocuments[collection];
    return serverDocsForCollection.get(id) || null;
  },

  _process_added: function (msg, updates) {
    var self = this;
    var id = LocalCollection._idParse(msg.id);
    var serverDoc = self._getServerDoc(msg.collection, id);
    if (serverDoc) {
      // Some outstanding stub wrote here.
      if (serverDoc.document !== undefined)
        throw new Error("Server sent add for existing id: " + msg.id);
      serverDoc.document = msg.fields || {};
      serverDoc.document._id = id;
    } else {
      self._pushUpdate(updates, msg.collection, msg);
    }
  },

  _process_changed: function (msg, updates) {
    var self = this;
    var serverDoc = self._getServerDoc(
      msg.collection, LocalCollection._idParse(msg.id));
    if (serverDoc) {
      if (serverDoc.document === undefined)
        throw new Error("Server sent changed for nonexisting id: " + msg.id);
      LocalCollection._applyChanges(serverDoc.document, msg.fields);
    } else {
      self._pushUpdate(updates, msg.collection, msg);
    }
  },

  _process_removed: function (msg, updates) {
    var self = this;
    var serverDoc = self._getServerDoc(
      msg.collection, LocalCollection._idParse(msg.id));
    if (serverDoc) {
      // Some outstanding stub wrote here.
      if (serverDoc.document === undefined)
        throw new Error("Server sent removed for nonexisting id:" + msg.id);
      serverDoc.document = undefined;
    } else {
      self._pushUpdate(updates, msg.collection, {
        msg: 'removed',
        collection: msg.collection,
        id: msg.id
      });
    }
  },

  _process_updated: function (msg, updates) {
    var self = this;
    // Process "method done" messages.
    _.each(msg.methods, function (methodId) {
      _.each(self._documentsWrittenByStub[methodId], function (written) {
        var serverDoc = self._getServerDoc(written.collection, written.id);
        if (!serverDoc)
          throw new Error("Lost serverDoc for " + JSON.stringify(written));
        if (!serverDoc.writtenByStubs[methodId])
          throw new Error("Doc " + JSON.stringify(written) +
                          " not written by  method " + methodId);
        delete serverDoc.writtenByStubs[methodId];
        if (_.isEmpty(serverDoc.writtenByStubs)) {
          // All methods whose stubs wrote this method have completed! We can
          // now copy the saved document to the database (reverting the stub's
          // change if the server did not write to this object, or applying the
          // server's writes if it did).

          // This is a fake ddp 'replace' message.  It's just for talking
          // between livedata connections and minimongo.  (We have to stringify
          // the ID because it's supposed to look like a wire message.)
          self._pushUpdate(updates, written.collection, {
            msg: 'replace',
            id: LocalCollection._idStringify(written.id),
            replace: serverDoc.document
          });
          // Call all flush callbacks.
          _.each(serverDoc.flushCallbacks, function (c) {
            c();
          });

          // Delete this completed serverDocument. Don't bother to GC empty
          // IdMaps inside self._serverDocuments, since there probably aren't
          // many collections and they'll be written repeatedly.
          self._serverDocuments[written.collection].remove(written.id);
        }
      });
      delete self._documentsWrittenByStub[methodId];

      // We want to call the data-written callback, but we can't do so until all
      // currently buffered messages are flushed.
      var callbackInvoker = self._methodInvokers[methodId];
      if (!callbackInvoker)
        throw new Error("No callback invoker for method " + methodId);
      self._runWhenAllServerDocsAreFlushed(
        _.bind(callbackInvoker.dataVisible, callbackInvoker));
    });
  },

  _process_ready: function (msg, updates) {
    var self = this;
    // Process "sub ready" messages. "sub ready" messages don't take effect
    // until all current server documents have been flushed to the local
    // database. We can use a write fence to implement this.
    _.each(msg.subs, function (subId) {
      self._runWhenAllServerDocsAreFlushed(function () {
        var subRecord = self._subscriptions[subId];
        // Did we already unsubscribe?
        if (!subRecord)
          return;
        // Did we already receive a ready message? (Oops!)
        if (subRecord.ready)
          return;
        subRecord.readyCallback && subRecord.readyCallback();
        subRecord.ready = true;
        subRecord.readyDeps.changed();
      });
    });
  },

  // Ensures that "f" will be called after all documents currently in
  // _serverDocuments have been written to the local cache. f will not be called
  // if the connection is lost before then!
  _runWhenAllServerDocsAreFlushed: function (f) {
    var self = this;
    var runFAfterUpdates = function () {
      self._afterUpdateCallbacks.push(f);
    };
    var unflushedServerDocCount = 0;
    var onServerDocFlush = function () {
      --unflushedServerDocCount;
      if (unflushedServerDocCount === 0) {
        // This was the last doc to flush! Arrange to run f after the updates
        // have been applied.
        runFAfterUpdates();
      }
    };
    _.each(self._serverDocuments, function (collectionDocs) {
      collectionDocs.forEach(function (serverDoc) {
        var writtenByStubForAMethodWithSentMessage = _.any(
          serverDoc.writtenByStubs, function (dummy, methodId) {
            var invoker = self._methodInvokers[methodId];
            return invoker && invoker.sentMessage;
          });
        if (writtenByStubForAMethodWithSentMessage) {
          ++unflushedServerDocCount;
          serverDoc.flushCallbacks.push(onServerDocFlush);
        }
      });
    });
    if (unflushedServerDocCount === 0) {
      // There aren't any buffered docs --- we can call f as soon as the current
      // round of updates is applied!
      runFAfterUpdates();
    }
  },

  _livedata_nosub: function (msg) {
    var self = this;

    // First pass it through _livedata_data, which only uses it to help get
    // towards quiescence.
    self._livedata_data(msg);

    // Do the rest of our processing immediately, with no
    // buffering-until-quiescence.

    // we weren't subbed anyway, or we initiated the unsub.
    if (!_.has(self._subscriptions, msg.id))
      return;

    // XXX COMPAT WITH 1.0.3.1 #errorCallback
    var errorCallback = self._subscriptions[msg.id].errorCallback;
    var stopCallback = self._subscriptions[msg.id].stopCallback;

    self._subscriptions[msg.id].remove();

    var meteorErrorFromMsg = function (msgArg) {
      return msgArg && msgArg.error && new Meteor.Error(
        msgArg.error.error, msgArg.error.reason, msgArg.error.details);
    }

    // XXX COMPAT WITH 1.0.3.1 #errorCallback
    if (errorCallback && msg.error) {
      errorCallback(meteorErrorFromMsg(msg));
    }

    if (stopCallback) {
      stopCallback(meteorErrorFromMsg(msg));
    }
  },

  _process_nosub: function () {
    // This is called as part of the "buffer until quiescence" process, but
    // nosub's effect is always immediate. It only goes in the buffer at all
    // because it's possible for a nosub to be the thing that triggers
    // quiescence, if we were waiting for a sub to be revived and it dies
    // instead.
  },

  _livedata_result: function (msg) {
    // id, result or error. error has error (code), reason, details

    var self = this;

    // find the outstanding request
    // should be O(1) in nearly all realistic use cases
    if (_.isEmpty(self._outstandingMethodBlocks)) {
      Meteor._debug("Received method result but no methods outstanding");
      return;
    }
    var currentMethodBlock = self._outstandingMethodBlocks[0].methods;
    var m;
    for (var i = 0; i < currentMethodBlock.length; i++) {
      m = currentMethodBlock[i];
      if (m.methodId === msg.id)
        break;
    }

    if (!m) {
      Meteor._debug("Can't match method response to original method call", msg);
      return;
    }

    // Remove from current method block. This may leave the block empty, but we
    // don't move on to the next block until the callback has been delivered, in
    // _outstandingMethodFinished.
    currentMethodBlock.splice(i, 1);

    if (_.has(msg, 'error')) {
      m.receiveResult(new Meteor.Error(
        msg.error.error, msg.error.reason,
        msg.error.details));
    } else {
      // msg.result may be undefined if the method didn't return a
      // value
      m.receiveResult(undefined, msg.result);
    }
  },

  // Called by MethodInvoker after a method's callback is invoked.  If this was
  // the last outstanding method in the current block, runs the next block. If
  // there are no more methods, consider accepting a hot code push.
  _outstandingMethodFinished: function () {
    var self = this;
    if (self._anyMethodsAreOutstanding())
      return;

    // No methods are outstanding. This should mean that the first block of
    // methods is empty. (Or it might not exist, if this was a method that
    // half-finished before disconnect/reconnect.)
    if (! _.isEmpty(self._outstandingMethodBlocks)) {
      var firstBlock = self._outstandingMethodBlocks.shift();
      if (! _.isEmpty(firstBlock.methods))
        throw new Error("No methods outstanding but nonempty block: " +
                        JSON.stringify(firstBlock));

      // Send the outstanding methods now in the first block.
      if (!_.isEmpty(self._outstandingMethodBlocks))
        self._sendOutstandingMethods();
    }

    // Maybe accept a hot code push.
    self._maybeMigrate();
  },

  // Sends messages for all the methods in the first block in
  // _outstandingMethodBlocks.
  _sendOutstandingMethods: function() {
    var self = this;
    if (_.isEmpty(self._outstandingMethodBlocks))
      return;
    _.each(self._outstandingMethodBlocks[0].methods, function (m) {
      m.sendMessage();
    });
  },

  _livedata_error: function (msg) {
    Meteor._debug("Received error from server: ", msg.reason);
    if (msg.offendingMessage)
      Meteor._debug("For: ", msg.offendingMessage);
  },

  _callOnReconnectAndSendAppropriateOutstandingMethods: function() {
    var self = this;
    var oldOutstandingMethodBlocks = self._outstandingMethodBlocks;
    self._outstandingMethodBlocks = [];

    self.onReconnect();

    if (_.isEmpty(oldOutstandingMethodBlocks))
      return;

    // We have at least one block worth of old outstanding methods to try
    // again. First: did onReconnect actually send anything? If not, we just
    // restore all outstanding methods and run the first block.
    if (_.isEmpty(self._outstandingMethodBlocks)) {
      self._outstandingMethodBlocks = oldOutstandingMethodBlocks;
      self._sendOutstandingMethods();
      return;
    }

    // OK, there are blocks on both sides. Special case: merge the last block of
    // the reconnect methods with the first block of the original methods, if
    // neither of them are "wait" blocks.
    if (!_.last(self._outstandingMethodBlocks).wait &&
        !oldOutstandingMethodBlocks[0].wait) {
      _.each(oldOutstandingMethodBlocks[0].methods, function (m) {
        _.last(self._outstandingMethodBlocks).methods.push(m);

        // If this "last block" is also the first block, send the message.
        if (self._outstandingMethodBlocks.length === 1)
          m.sendMessage();
      });

      oldOutstandingMethodBlocks.shift();
    }

    // Now add the rest of the original blocks on.
    _.each(oldOutstandingMethodBlocks, function (block) {
      self._outstandingMethodBlocks.push(block);
    });
  },

  // We can accept a hot code push if there are no methods in flight.
  _readyToMigrate: function() {
    var self = this;
    return _.isEmpty(self._methodInvokers);
  },

  // If we were blocking a migration, see if it's now possible to continue.
  // Call whenever the set of outstanding/blocked methods shrinks.
  _maybeMigrate: function () {
    var self = this;
    if (self._retryMigrate && self._readyToMigrate()) {
      self._retryMigrate();
      self._retryMigrate = null;
    }
  }
});

LivedataTest.Connection = Connection;

// @param url {String} URL to Meteor app,
//     e.g.:
//     "subdomain.meteor.com",
//     "http://subdomain.meteor.com",
//     "/",
//     "ddp+sockjs://ddp--****-foo.meteor.com/sockjs"

/**
 * @summary Connect to the server of a different Meteor application to subscribe to its document sets and invoke its remote methods.
 * @locus Anywhere
 * @param {String} url The URL of another Meteor application.
 */
DDP.connect = function (url, options) {
  var ret = new Connection(url, options);
  allConnections.push(ret); // hack. see below.
  return ret;
};

// Hack for `spiderable` package: a way to see if the page is done
// loading all the data it needs.
//
allConnections = [];
DDP._allSubscriptionsReady = function () {
  return _.all(allConnections, function (conn) {
    return _.all(conn._subscriptions, function (sub) {
      return sub.ready;
    });
  });
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp/server_convenience.js                                                                                  //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// Only create a server if we are in an environment with a HTTP server
// (as opposed to, eg, a command-line tool).
//
// Note: this whole conditional is a total hack to get around the fact that this
// package logically should be split into a ddp-client and ddp-server package;
// see https://github.com/meteor/meteor/issues/3452
//
// Until we do that, this conditional (and the weak dependency on webapp that
// should really be a strong dependency of the ddp-server package) allows you to
// build projects which use `ddp` in Node without wanting to run a DDP server
// (ie, allows you to act as if you were using the nonexistent `ddp-client`
// server package).
if (Package.webapp) {
  if (process.env.DDP_DEFAULT_CONNECTION_URL) {
    __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL =
      process.env.DDP_DEFAULT_CONNECTION_URL;
  }

  Meteor.server = new Server;

  Meteor.refresh = function (notification) {
    DDPServer._InvalidationCrossbar.fire(notification);
  };

  // Proxy the public methods of Meteor.server so they can
  // be called directly on Meteor.
  _.each(['publish', 'methods', 'call', 'apply', 'onConnection'],
         function (name) {
           Meteor[name] = _.bind(Meteor.server[name], Meteor.server);
         });
} else {
  // No server? Make these empty/no-ops.
  Meteor.server = null;
  Meteor.refresh = function (notification) {
  };

  // Make these empty/no-ops too, so that non-webapp apps can still
  // depend on/use packages that use those functions.
  _.each(['publish', 'methods', 'onConnection'],
      function (name) {
        Meteor[name] = function () { };
      });
}

// Meteor.server used to be called Meteor.default_server. Provide
// backcompat as a courtesy even though it was never documented.
// XXX COMPAT WITH 0.6.4
Meteor.default_server = Meteor.server;

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package.ddp = {
  DDP: DDP,
  DDPServer: DDPServer,
  LivedataTest: LivedataTest
};

})();

//# sourceMappingURL=ddp.js.map
