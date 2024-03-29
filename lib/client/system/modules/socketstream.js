'use strict';
// SocketStream Browser Client
// ---------------------------
// The code in this file is always sent to the browser, regardless which websocket transport is used
var message, server, transport = null,
    EventEmitter2 = require('eventemitter2').EventEmitter2;

// Setup message emitters
server = exports.server = new EventEmitter2();

message = exports.message = new EventEmitter2();

// Provide a place to store templates
exports.tmpl = {};

exports.assignTransport = function (config) {
  require('socketstream-cookie-session').setTransportConfig(config);
  transport = require('socketstream-transport')(server, message, config);
  var r = transport.connect();
  if (!transport.send) { transport.send = r; }
  return transport.send;
};

exports.registerApi = function(name, fn) {
  var api;
  api = exports[name];
  if (api) {
    return console.error('SocketStream Error: Unable to register the "ss.' + name + '" responder as this name has already been taken');
  } else {
    exports[name] = fn;
    return exports[name];
  }
};

exports.send = function(responderId) {
  return function(msg) {
    return transport.send(responderId + '|' + msg);
  };
};

/* ON DEMAND LOADING
*/


var async = {
  loaded: {},
  loading: new EventEmitter2
};

exports.load = {

  // Enables asynchronous loading of additional client-side modules
  // Pass the name of a module file (complete with file extension), or name of a directory in /client/code
  code: function(nameOrDir, cb) {
    var errorPrefix, onError, onSuccess;

    // Strip any leading slash
    if (nameOrDir && nameOrDir.substr(0, 1) === '/') {
      nameOrDir = nameOrDir.substr(1);
    }

    // Check for errors. Note this feature requires jQuery at the moment
    errorPrefix = 'SocketStream Error: The ss.load.code() command ';
    if (!jQuery) {
      return console.error(errorPrefix + 'requires jQuery to be present');
    }
    if (!nameOrDir) {
      return console.error(errorPrefix + 'requires a directory to load. Specify it as the first argument. '+
        'E.g. The ss.load.code(\'/mail\',cb) will load code in /client/code/mail');
    }
    if (!cb) {
      return console.error(errorPrefix + 'requires a callback. Specify it as the last argument');
    }

    // If we've loaded this module or package before, callback right away
    if (async.loaded[nameOrDir]) {
      return cb();
    }

    // Else, register callback and use EE to prevent multiple reqs for the same mod/package to the server before the first responds
    async.loading.once(nameOrDir, cb);

    // Retrieve module or directory of modules from the server if this is the first request
    if (async.loading.listeners(nameOrDir).length === 1) {
      onError = function() {
        console.error('SocketStream Error: Could not asynchronously load ' + nameOrDir);
        return console.log(arguments);
      };
      onSuccess = function() {
        async.loaded[nameOrDir] = true;
        return async.loading.emit(nameOrDir);
      };

      // Send request to server
      return $.ajax({
        url: '/assets/ondemand/' + nameOrDir,
        type: 'GET',
        cache: false,
        dataType: 'script',
        success: onSuccess,
        error: onError
      });
    }
  },

  // Load Web Workers from /client/workers
  worker: function(name) {
    return new Worker('/assets/workers/' + name);
  }
};

/* LIVE RELOAD
*/

// Reload browser if reload system event received
server.on('__ss:reload', function() {
  return window.location.reload();
});

// Reload CSS if only the stylesheets have changed
server.on('__ss:updateCSS', function() {
  var h, tag, _i, _len, _ref;
  _ref = document.getElementsByTagName('link');
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    tag = _ref[_i];
    if (tag.rel.toLowerCase().indexOf('stylesheet') >= 0 && tag.href) {
      h = tag.href.replace(/(&|%5C?)\d+/, '');
      tag.href = h + (h.indexOf('?') >= 0 ? '&' : '?') + (new Date().valueOf());
    }
  }
  return console.log('CSS updated');
});
