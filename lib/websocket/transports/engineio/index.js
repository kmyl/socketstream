// Engine.IO server-side wrapper
'use strict';

var fs = require('fs'),
    path = require('path'),
    http = require('http'),
    debug = require('debug')('websocket');

var openSocketsById = {}; // is this equivalent to this.ws.clients ?

/*
  ss.ws.transport.ws = engine.io Server
  ss.ws.transport.http = http Server

  ss.ws.transport.ws.cookie = cookie name
  ss.ws.transport.ws.ws = domain options path clients
*/

module.exports = function(ss, messageEmitter, config){
  config = config || {};
  config.server = config.server || {};
  config.client = config.client || {};

  //TODO enforce config.server.cookie = "io"

  /* FUTURE
  The client will be built to be loaded with SystemJS EventEmitter2 will take place of EventEmitter
  */

  // Send Engine.IO client-side code
  var clientPath = ss.require.resolve('engine.io-client/dist/engine.io.js', { warn:'Please add "engine.io-client" as an npm dependency'});
  if (clientPath) {
    var engineioClient = fs.readFileSync(clientPath, 'utf8');
    ss.client.send('lib', 'engine.io-client', engineioClient, {minified: false}); // tested this with minified: true ; worked fine.
  } else {
    debug('Streaming will not work without the clientside transport.');
  }

  // Send socketstream-transport module
  var code = fs.readFileSync(path.join(__dirname, 'wrapper.js'), 'utf8');
  ss.client.send('mod', 'socketstream-transport', code);

  //TODO mixin config.client.cookieName for session if not httpOnly session ID
  // Tell the SocketStream client to use this transport, passing any client-side config along to the wrapper
  ss.client.send('code', 'transport', "require('socketstream').assignTransport(" + JSON.stringify(config.client) + ");");

  debug('Engine IO queued.');

  // Return API for sending events
  // Note the '0' message prefix (which signifies the responderId) is reserved for sending events
  var api = {
    get http() {
      if (!this._http) {
        this._http = http.createServer(function(req,res) {
          return ss.http.middleware(req,res); // HTTP request middleware can be defined after the websocket server
        });
        debug('Engine IO Server started.');

        // Create a new Engine.IO server and bind to /ws
        var engine = ss.require('engine.io'),
            ws = this.ws = engine.attach(this._http, config.server);

        // Handle incoming connections
        ws.on('connection', onConnection);
      }
      return this._http;
    },

    event: eventFn
  };

  return api;

  function onConnection(socket) {
    // socket.is = ID from 'io' cookie
    // socket.request.headers.cookie has cookie string
    var sessionToken = ss.session.extractSocketSessionToken(socket.request);
    debug('on connection (session=%s)',sessionToken);
    if (sessionToken) {
      //TODO all this stuff should go in the session store
      socket.sessionToken = sessionToken;

      // Store this here before it gets cleaned up after the websocket upgrade
      socket.remoteAddress = socket.request.connection.remoteAddress;

      // Get real IP if behind proxy
      var xForwardedFor = socket.request.headers['x-forwarded-for'];
      if (xForwardedFor) {
        socket.remoteAddress = xForwardedFor.split(',')[0];
      }

      // Allow this connection to be addressed by the socket ID
      openSocketsById[socket.id] = socket;
      ss.session.find(socket.sessionToken, socket.id, function(session){
        socket.send('X|OK|'+sessionToken);
        debug('session %s found, sent X|OK to client.',sessionToken);
      });

      // changed from data
      socket.on('message', function(msg) {
        debug('message: %s',msg);
        try {
          var i;
          if ( (i = msg.indexOf('|')) > 0) {
            var responderId = msg.substr(0, i);
            var content = msg.substr(i+1);
          } else { throw new Error('Message does not contain a responderId');}

          var meta = {socketId: socket.id, sessionId: socket.sessionToken, sessionToken: socket.sessionToken, clientIp: socket.remoteAddress, transport: 'engineio'};

          // Invoke the relevant Request Responder, passing a callback function which
          // will automatically direct any response back to the correct client-side code
          messageEmitter.emit(responderId, content, meta, function(data){
            return socket.send(responderId + '|' + data);
          });
        }
        catch (e) {
          ss.log.error('Invalid websocket message received:', msg);
        }
      });

      // If the browser disconnects, remove this connection from openSocketsById
      socket.on('close', function() {
        debug('connection closed for %s.',socket.id);
        if(openSocketsById[socket.id]) {
          delete openSocketsById[socket.id];
        }
      });
    }
  }

  function eventFn() {
    return {

      // Send the same message to every open socket
      all: function(msg) {
        for (var id in openSocketsById) {
          if (openSocketsById.hasOwnProperty(id)) {
            openSocketsById[id].send('0|' + msg + '|null');
          }
        }
      },

      // Send an event to a specific socket
      // Note: 'meta' is typically the name of the channel
      socketId: function(id, msg, meta) {
        var socket = openSocketsById[id];
        if (socket) {
          return socket.send('0|' + msg + '|' + meta);
        } else {
          return false;
        }
      }
    }
  }
}
