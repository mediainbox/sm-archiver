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
    if (this.options.debug) {
      this.options.logger = console;
    }
    this.db = new AWS.DynamoDB(this.options);
    _.extend(this, new AWS.DynamoDB.DocumentClient(this.options));
    P.promisifyAll(this.db);
    P.promisifyAll(this);
    this.createTable();
    this.hours = (this.options.size || 1440) / 60 / 6;
    debug("Created for " + this.stream.key);
  }

  DynamoDBStore.prototype.createTable = function() {
    this.table = "sm-archiver-" + this.stream.key;
    debug("Creating table " + this.table);
    return this.db.createTableAsync({
      TableName: this.table,
      KeySchema: [
        {
          AttributeName: 'type',
          KeyType: 'HASH'
        }, {
          AttributeName: 'id',
          KeyType: 'RANGE'
        }
      ],
      AttributeDefinitions: [
        {
          AttributeName: 'type',
          AttributeType: 'S'
        }, {
          AttributeName: 'id',
          AttributeType: 'N'
        }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 1
      }
    }).then((function(_this) {
      return function() {
        return debug("CREATED table " + _this.table);
      };
    })(this))["catch"]((function(_this) {
      return function(error) {
        return debug("CREATE table Error for " + _this.table + ": " + error);
      };
    })(this));
  };

  DynamoDBStore.prototype.indexSegment = function(segment) {
    segment = _.clone(segment);
    segment.ts = segment.ts.valueOf();
    segment.end_ts = segment.end_ts.valueOf();
    segment.ts_actual = segment.ts_actual.valueOf();
    segment.end_ts_actual = segment.end_ts_actual.valueOf();
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
    return this.updateAsync({
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
    return this.getOne('segment', id, fields).then(function(segment) {
      segment.ts = moment(segment.ts).toDate();
      segment.end_ts = moment(segment.end_ts).toDate();
      segment.ts_actual = moment(segment.ts_actual).toDate();
      segment.end_ts_actual = moment(segment.end_ts_actual).toDate();
      return segment;
    });
  };

  DynamoDBStore.prototype.getOne = function(type, id, fields) {
    debug("Getting " + type + " " + id + " from " + this.stream.key);
    return this.getAsync({
      TableName: this.table,
      Key: {
        type: type,
        id: Number(id)
      },
      AttributesToGet: fields
    }).then(function(result) {
      return result.Item;
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
    return this.getMany('segment', options, attribute).each(function(segment) {
      segment.ts = moment(segment.ts).toDate();
      segment.end_ts = moment(segment.end_ts).toDate();
      segment.ts_actual = moment(segment.ts_actual).toDate();
      segment.end_ts_actual = moment(segment.end_ts_actual).toDate();
      return segment;
    });
  };

  DynamoDBStore.prototype.getComments = function(options) {
    return this.getMany('segment', options, 'comment');
  };

  DynamoDBStore.prototype.getExports = function(options) {
    return this.getMany('export', options);
  };

  DynamoDBStore.prototype.getMany = function(type, options, attribute) {
    var from, to;
    if (options.from) {
      from = this.parseId(options.from);
      to = this.parseId(options.to) || moment(from).add(this.hours, 'hours').valueOf();
    } else if (options.to) {
      to = this.parseId(options.to);
      from = this.parseId(options.from) || moment(to).subtract(this.hours, 'hours').valueOf();
    } else {
      to = moment().valueOf();
      from = moment(to).subtract(this.hours, 'hours').valueOf();
    }
    return this.queryManyLoop([], type, attribute, from, to);
  };

  DynamoDBStore.prototype.queryManyLoop = function(items, type, attribute, from, to, lastEvaluatedKey) {
    return this.queryMany(type, attribute, from, to, lastEvaluatedKey).then((function(_this) {
      return function(result) {
        return P.map(result.Items, function(item) {
          if (attribute) {
            return item[attribute];
          } else {
            return item;
          }
        }).filter(function(item) {
          return item;
        }).then(function(results) {
          items = items.concat(results);
          if (!result.LastEvaluatedKey) {
            return items;
          }
          return _this.queryManyLoop(items, type, attribute, from, to, result.LastEvaluatedKey);
        });
      };
    })(this));
  };

  DynamoDBStore.prototype.queryMany = function(type, attribute, from, to, lastEvaluatedKey) {
    var message, options;
    message = "Searching " + (attribute || type) + " " + from + " -> " + to + " from " + this.stream.key;
    if (lastEvaluatedKey) {
      message += " starting at " + lastEvaluatedKey.id;
    }
    debug(message);
    options = {
      TableName: this.table,
      KeyConditionExpression: '#T = :type AND #I BETWEEN :from AND :to',
      ExpressionAttributeNames: {
        '#T': 'type',
        '#I': 'id'
      },
      ExpressionAttributeValues: {
        ':type': type,
        ':from': from,
        ':to': to
      }
    };
    if (lastEvaluatedKey) {
      options.ExclusiveStartKey = lastEvaluatedKey;
    }
    return this.queryAsync(options)["catch"]((function(_this) {
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
