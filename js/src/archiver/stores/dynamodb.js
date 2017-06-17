var AWS, DynamoDBStore, P, R_TIMESTAMP, _, debug, exportKeys, moment, segmentKeys;

P = require('bluebird');

AWS = require('aws-sdk');

_ = require('underscore');

moment = require('moment');

debug = require('debug')('sm:archiver:stores:dynamodb');

R_TIMESTAMP = /^[1-9][0-9]*$/;

segmentKeys = ['id', 'ts', 'end_ts', 'ts_actual', 'end_ts_actual', 'data_length', 'duration', 'discontinuitySeq', 'pts', 'waveform', 'comment'];

exportKeys = ['id', 'format', 'to', 'from'];

DynamoDBStore = (function() {
  function DynamoDBStore(stream, options1) {
    this.stream = stream;
    this.options = options1;
    _.extend(this, new AWS.DynamoDB.DocumentClient(this.options));
    P.promisifyAll(this);
    this.table = "sm-archiver-" + this.stream.key;
    this.hours = this.options.size / 60 / 6;
    debug("Created for " + this.stream.key);
  }

  DynamoDBStore.prototype.indexSegment = function(segment) {
    debug(_.pick(segment, segmentKeys));
    return this.indexOne('segment', segment.id, _.pick(segment, segmentKeys));
  };

  DynamoDBStore.prototype.indexComment = function(comment) {
    return this.updateOne('segment', comment.id, 'comment', comment);
  };

  DynamoDBStore.prototype.indexExport = function(exp) {
    return this.indexOne('export', exp.id, _.pick(exp, exportKeys));
  };

  DynamoDBStore.prototype.deleteExport = function(id) {
    return this.deleteOne('export', id);
  };

  DynamoDBStore.prototype.indexOne = function(type, id, body) {
    debug("Indexing " + type + " " + id);
    return this.putAsync({
      TableName: this.table,
      Item: _.extend({
        type: type,
        id: id
      }, body)
    })["catch"]((function(_this) {
      return function(error) {
        return debug("INDEX " + type + " Error for " + _this.stream.key + "/" + id + ": " + error);
      };
    })(this));
  };

  DynamoDBStore.prototype.updateOne = function(type, id, name, value) {
    debug("Updating " + type + " " + id);
    return this.updateItemAsync({
      TableName: this.table,
      Key: {
        type: type,
        id: id
      },
      ExpressionAttributeNames: {
        '#N': name
      },
      ExpressionAttributeValues: {
        ':v': value
      },
      UpdateExpression: 'SET #N = :v'
    })["catch"]((function(_this) {
      return function(error) {
        return debug("UPDATE " + type + " Error for " + _this.stream.key + "/" + id + ": " + error);
      };
    })(this));
  };

  DynamoDBStore.prototype.getSegment = function(id, fields) {
    return this.getOne('segment', id, fields);
  };

  DynamoDBStore.prototype.getOne = function(type, id, fields) {
    debug("Getting " + type + " " + id + " from " + this.stream.key);
    return this.getAsync({
      TableName: this.table,
      Key: {
        type: type,
        id: id
      },
      AttributesToGet: fields
    }).then(function(result) {
      return result._source;
    })["catch"]((function(_this) {
      return function(error) {
        return debug("GET " + type + " Error for " + _this.stream.key + "/" + id + ": " + error);
      };
    })(this));
  };

  DynamoDBStore.prototype.deleteOne = function(type, id) {
    debug("Deleting " + type + " " + id + " from " + this.stream.key);
    return this.deleteAsync({
      TableName: this.table,
      Key: {
        type: type,
        id: id
      }
    })["catch"]((function(_this) {
      return function(error) {
        return debug("DELETE " + type + " Error for " + _this.stream.key + "/" + id + ": " + error);
      };
    })(this));
  };

  DynamoDBStore.prototype.getSegments = function(options, attribute) {
    return this.getMany('segment', options, attribute);
  };

  DynamoDBStore.prototype.getComments = function(options) {
    return this.getMany('segment', options, 'comment');
  };

  DynamoDBStore.prototype.getExports = function(options) {
    return this.getMany('export', options);
  };

  DynamoDBStore.prototype.getMany = function(type, options, attribute) {
    var expression, first, from, last, to;
    first = moment().subtract(this.hours, 'hours').valueOf();
    last = moment().valueOf();
    from = this.parseId(options.from, first);
    to = this.parseId(options.to, last);
    debug("Searching " + (attribute || type) + " " + from + " -> " + to + " from " + this.stream.key);
    expression = '#I';
    if (options.from) {
      expression += ' >= :f';
    }
    if (options.from && options.to) {
      expression += ' AND';
    }
    if (option.to) {
      expression += ' < :t';
    }
    return this.scanAsync({
      TableName: this.table,
      FilterExpression: expression,
      ExpressionAttributeNames: {
        '#I': 'id'
      },
      ExpressionAttributeValues: {
        ':f': from,
        ':t': to
      }
    }).then(function(result) {
      return P.map(result.Items, function(item) {
        if (attribute) {
          return item[attribute];
        } else {
          return item;
        }
      });
    })["catch"]((function(_this) {
      return function(error) {
        return debug("SEARCH " + (attribute || type) + " Error for " + _this.stream.key + ": " + error);
      };
    })(this));
  };

  DynamoDBStore.prototype.parseId = function(id, defaultId) {
    if (!id) {
      return defaultId;
    }
    if (R_TIMESTAMP.test(id)) {
      return Number(id);
    }
    return moment(id).valueOf();
  };

  return DynamoDBStore;

})();

module.exports = DynamoDBStore;

//# sourceMappingURL=dynamodb.js.map
