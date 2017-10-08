var Runner, config, debug, heapdump, request, runner;

heapdump = require('heapdump');

require('./tools/stackdriver-debugger');

request = require('request');

debug = require('debug')('sm:archiver:runner');

config = require('./config');

Runner = (function() {
  function Runner(config1) {
    this.config = config1;
    debug('Created');
  }

  Runner.prototype.initialize = function() {
    return this.getRadio((function(_this) {
      return function(radio) {
        _this.ping();
        return _this.createArchiver(radio);
      };
    })(this));
  };

  Runner.prototype.getRadio = function(callback) {
    return request.get(this.config.uri, {
      json: true,
      qs: {
        ping: 'archiver'
      }
    }, (function(_this) {
      return function(error, response, body) {
        if (error) {
          debug(error);
          return _this.retry(callback);
        }
        if (!body) {
          debug('No radio available');
          return _this.retry(callback);
        }
        return callback(body);
      };
    })(this));
  };

  Runner.prototype.retry = function(callback) {
    return setTimeout((function(_this) {
      return function() {
        debug('Retry');
        return _this.getRadio(callback);
      };
    })(this), this.config.ping / 2);
  };

  Runner.prototype.createArchiver = function(radio1) {
    this.radio = radio1;
    return new (this.getArchiver())(this.radio.options);
  };

  Runner.prototype.getArchiver = function() {
    this.archiver = this.archiver || require('./archiver');
    return this.archiver;
  };

  Runner.prototype.ping = function() {
    return setTimeout((function(_this) {
      return function() {
        debug('Ping');
        return request.put(_this.config.uri, {
          qs: {
            ping: 'archiver',
            name: _this.radio.name
          }
        }, function() {
          return _this.ping();
        });
      };
    })(this), this.config.ping);
  };

  return Runner;

})();

runner = new Runner(config);

runner.initialize();

process.on('uncaughtException', function(error) {
  debug(error);
  if (("" + error) === 'Error: got binary data when not reconstructing a packet') {
    return;
  }
  return process.exit(1);
});

//# sourceMappingURL=runner.js.map
