var Archiver, Logger, Server, StreamArchiver, debug,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

Logger = require('streammachine/js/src/streammachine/logger');

StreamArchiver = require('./stream');

Server = require('./server');

debug = require('debug')('sm:archiver');

Archiver = (function(superClass) {
  extend(Archiver, superClass);

  function Archiver(options) {
    var format, key, keyParts, stream;
    this.options = options;
    this.streams = {};
    this.stream_groups = {};
    this.root_route = null;
    this.connected = false;
    this._retrying = null;
    this.log = new Logger({
      stdout: true
    });
    key = this.options.streams[0];
    keyParts = key.match(/(.*)\.(\w{3})$/i);
    format = keyParts ? keyParts[2] : 'mp3';
    stream = {
      key: key,
      opts: {
        format: format,
        codec: null
      }
    };
    this.streams = {};
    this.streams[stream.key] = stream;
    stream.archiver = new StreamArchiver(stream, this.options);
    this.server = new Server(this, this.options, this.log.child({
      component: 'server'
    }));
    debug('Created');
  }

  return Archiver;

})(require('streammachine/js/src/streammachine/slave'));

module.exports = Archiver;

//# sourceMappingURL=index.js.map
