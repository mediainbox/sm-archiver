var AWS, P, S3Store, _, debug, moment,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

P = require("bluebird");

AWS = require("aws-sdk");

_ = require("underscore");

moment = require("moment");

debug = require("debug")("sm:archiver:stores:s3");

S3Store = (function() {
  function S3Store(stream, options1) {
    this.stream = stream;
    this.options = options1;
    this.deleteExport = bind(this.deleteExport, this);
    this.putExport = bind(this.putExport, this);
    this.getExportById = bind(this.getExportById, this);
    this.getAudioById = bind(this.getAudioById, this);
    _.extend(this, new AWS.S3(this.options));
    P.promisifyAll(this);
    this.prefix = "sm-archiver/" + this.stream.key;
    this.format = this.stream.opts.format;
    debug("Created for " + this.stream.key);
  }

  S3Store.prototype.getAudioById = function(id, format) {
    if (format && format !== this.format) {
      return P.resolve();
    }
    return this.getFile("audio/" + id + "." + (format || this.format)).then((function(_this) {
      return function(data) {
        return data.Body;
      };
    })(this));
  };

  S3Store.prototype.getAudiosByIds = function(ids) {
    return P.map(ids, (function(_this) {
      return function(id) {
        return _this.getAudioById(id)["catch"](function() {});
      };
    })(this)).filter(function(audio) {
      return audio;
    });
  };

  S3Store.prototype.getExportById = function(id, format) {
    if (format && format !== this.format) {
      return P.resolve();
    }
    return this.getFile("exports/" + id + "." + (format || this.format)).then((function(_this) {
      return function(data) {
        return data.Body;
      };
    })(this));
  };

  S3Store.prototype.putExport = function(exp, options) {
    return this.putFile("exports/" + exp.id + "." + this.format, exp.concat(), options);
  };

  S3Store.prototype.deleteExport = function(id, options) {
    return this.deleteFile("exports/" + id + "." + this.stream.opts.format);
  };

  S3Store.prototype.getFile = function(key) {
    key = this.prefix + "/" + key;
    debug("Getting " + key);
    return this.getObjectAsync({
      Key: key
    })["catch"]((function(_this) {
      return function(error) {
        debug("GET Error for " + key + ": " + error);
        throw error;
      };
    })(this));
  };

  S3Store.prototype.putFileIfNotExists = function(name, body, options) {
    var key;
    key = this.prefix + "/" + name;
    return this.headObjectAsync({
      Key: key
    }).then((function(_this) {
      return function() {
        return debug("Skipping " + key);
      };
    })(this))["catch"]((function(_this) {
      return function(error) {
        if (error.statusCode !== 404) {
          return debug("HEAD Error for " + key + ": " + error);
        }
        return _this.putFile(name, body, options);
      };
    })(this));
  };

  S3Store.prototype.putFile = function(name, body, options) {
    var key;
    key = this.prefix + "/" + name;
    debug("Storing " + key);
    return this.putObjectAsync(_.extend({}, options || {}, {
      Key: key,
      Body: body
    }))["catch"](function(error) {
      return debug("PUT Error for " + key + ": " + error);
    });
  };

  S3Store.prototype.deleteFile = function(name, options) {
    var key;
    key = this.prefix + "/" + name;
    debug("Deleting " + key);
    return this.deleteObjectAsync(_.extend({}, options || {}, {
      Key: key
    }))["catch"](function(error) {
      return debug("DELETE Error for " + key + ": " + error);
    });
  };

  return S3Store;

})();

module.exports = S3Store;

//# sourceMappingURL=s3.js.map
