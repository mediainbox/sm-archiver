var ElasticsearchStore, P, R_TIMESTAMP, _, debug, elasticsearch, exportKeys, moment, segmentKeys;

P = require("bluebird");

_ = require("underscore");

moment = require("moment");

elasticsearch = require("elasticsearch");

debug = require("debug")("sm:archiver:stores:elasticsearch");

R_TIMESTAMP = /^[1-9][0-9]*$/;

segmentKeys = ["id", "ts", "end_ts", "ts_actual", "end_ts_actual", "data_length", "duration", "discontinuitySeq", "pts", "waveform", "comment"];

exportKeys = ["id", "format", "to", "from"];

ElasticsearchStore = (function() {
  function ElasticsearchStore(stream, options) {
    this.stream = stream;
    this.options = _.clone(options);
    _.extend(this, new elasticsearch.Client(this.options));
    this.hours = this.options.size / 60 / 6;
    debug("Created for " + this.stream.key);
  }

  ElasticsearchStore.prototype.indexSegment = function(segment) {
    return this.indexOne("segment", segment.id, _.pick(segment, segmentKeys));
  };

  ElasticsearchStore.prototype.indexComment = function(comment) {
    return this.updateOne("segment", comment.id, {
      comment: comment
    });
  };

  ElasticsearchStore.prototype.indexExport = function(exp) {
    return this.indexOne("export", exp.id, _.pick(exp, exportKeys));
  };

  ElasticsearchStore.prototype.deleteExport = function(id) {
    return this.deleteOne("export", id);
  };

  ElasticsearchStore.prototype.indexOne = function(type, id, body) {
    debug("Indexing " + type + " " + id);
    return this.index({
      index: this.stream.key,
      type: type,
      id: id,
      body: body
    })["catch"]((function(_this) {
      return function(error) {
        return debug("INDEX " + type + " Error for " + _this.stream.key + "/" + id + ": " + error);
      };
    })(this));
  };

  ElasticsearchStore.prototype.updateOne = function(type, id, doc) {
    debug("Updating " + type + " " + id);
    return this.update({
      index: this.stream.key,
      type: type,
      id: id,
      body: {
        doc: doc
      }
    })["catch"]((function(_this) {
      return function(error) {
        return debug("UPDATE " + type + " Error for " + _this.stream.key + "/" + id + ": " + error);
      };
    })(this));
  };

  ElasticsearchStore.prototype.getSegment = function(id, fields) {
    return this.getOne("segment", id, fields);
  };

  ElasticsearchStore.prototype.getOne = function(type, id, fields) {
    debug("Getting " + type + " " + id + " from " + this.stream.key);
    return this.get({
      index: this.stream.key,
      type: type,
      id: id,
      fields: fields
    }).then((function(_this) {
      return function(result) {
        return result._source;
      };
    })(this))["catch"]((function(_this) {
      return function(error) {
        return debug("GET " + type + " Error for " + _this.stream.key + "/" + id + ": " + error);
      };
    })(this));
  };

  ElasticsearchStore.prototype.deleteOne = function(type, id) {
    debug("Deleting " + type + " " + id + " from " + this.stream.key);
    return this["delete"]({
      index: this.stream.key,
      type: type,
      id: id
    })["catch"]((function(_this) {
      return function(error) {
        return debug("DELETE " + type + " Error for " + _this.stream.key + "/" + id + ": " + error);
      };
    })(this));
  };

  ElasticsearchStore.prototype.getSegments = function(options, attribute) {
    return this.getMany("segment", options, attribute);
  };

  ElasticsearchStore.prototype.getComments = function(options) {
    return this.getMany("segment", options, "comment");
  };

  ElasticsearchStore.prototype.getExports = function(options) {
    return this.getMany("export", options);
  };

  ElasticsearchStore.prototype.getMany = function(type, options, attribute) {
    var first, from, last, query, to;
    first = moment().subtract(this.hours, 'hours').valueOf();
    last = moment().valueOf();
    from = this.parseId(options.from, first);
    to = this.parseId(options.to, last);
    debug("Searching " + (attribute || type) + " " + from + " -> " + to + " from " + this.stream.key);
    query = {
      range: {
        id: {
          gte: from,
          lt: to
        }
      }
    };
    if (options.allowUnlimited && !options.from && !options.to) {
      query = void 0;
    } else if (options.from || options.to) {
      query.range.id.gte = options.from;
      query.range.id.lt = options.to || last;
    }
    return this.search({
      index: this.stream.key,
      type: type,
      body: {
        size: this.options.size,
        sort: "id",
        query: query
      }
    }).then((function(_this) {
      return function(result) {
        return P.map(result.hits.hits, function(hit) {
          var ref;
          if (attribute) {
            return (ref = hit._source) != null ? ref[attribute] : void 0;
          } else {
            return hit._source;
          }
        });
      };
    })(this))["catch"]((function(_this) {
      return function(error) {
        return debug("SEARCH " + (attribute || type) + " Error for " + _this.stream.key + ": " + error);
      };
    })(this));
  };

  ElasticsearchStore.prototype.parseId = function(id, defaultId) {
    if (!id) {
      return defaultId;
    }
    if (R_TIMESTAMP.test(id)) {
      return Number(id);
    }
    return moment(id).valueOf();
  };

  return ElasticsearchStore;

})();

module.exports = ElasticsearchStore;

//# sourceMappingURL=elasticsearch.js.map
