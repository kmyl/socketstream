'use strict';

var path = require('path'),
    ss   = require( '../../../lib/socketstream'),
    sinon = require('sinon'),
    log  = require( '../../../lib/utils/log'),
    consoleOrig = {
      info: console.info,
      log: console.log,
      error: console.error,
      debug: console.debug
    };

describe('lib/utils/log', function() {
    ss.api.publish = {
      all: function() {}
    };

    it('should no longer be a function', function(done) {
        log.should.have.a.type('object');
        done();
    });
    it('should have a function property #debug', function(done) {
        log.should.have.a.property('debug').with.a.type('function');
        done();
    });
    it('should have a function property #info', function(done) {
        log.should.have.a.property('info').with.a.type('function');
        done();
    });
    it('should have a function property #warn', function(done) {
        log.should.have.a.property('warn').with.a.type('function');
        done();
    });
    it('should have a function property #error', function(done) {
        log.should.have.a.property('error').with.a.type('function');
        done();
    });
});
