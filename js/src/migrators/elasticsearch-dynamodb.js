var AWS, ElasticsearchToDynamoDBMigrator, P, _, debug, elasticsearch, moment;

P = require('bluebird');

AWS = require('aws-sdk');

_ = require('underscore');

moment = require('moment');

elasticsearch = require('elasticsearch');

debug = require('debug')('sm:migrators:elasticsearch-dynamodb');

ElasticsearchToDynamoDBMigrator = (function() {
  function ElasticsearchToDynamoDBMigrator(options) {
    this.options = options;
    this.elasticsearch = new elasticsearch.Client(_.clone(this.options.elasticsearch));
    this.db = new AWS.DynamoDB(this.options.dynamodb);
    this.dynamodb = new AWS.DynamoDB.DocumentClient(this.options.dynamodb);
    P.promisifyAll(this.db);
    P.promisifyAll(this.dynamodb);
    debug('Created');
  }

  ElasticsearchToDynamoDBMigrator.prototype.initialize = function() {
    return this.createTable().then((function(_this) {
      return function() {
        debug('Starting to migrate segments');
        return _this.migrate('segment');
      };
    })(this)).then((function(_this) {
      return function() {
        debug('Starting to migrate exports');
        return _this.migrate('export');
      };
    })(this));
  };

  ElasticsearchToDynamoDBMigrator.prototype.createTable = function() {
    debug("Creating table " + this.options.dynamodb.table);
    return this.db.createTableAsync({
      TableName: this.options.dynamodb.table,
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
        return debug("CREATED table " + _this.options.dynamodb.table);
      };
    })(this))["catch"]((function(_this) {
      return function(error) {
        return debug("CREATE table Error for " + _this.options.dynamodb.table + ": " + error);
      };
    })(this));
  };

  ElasticsearchToDynamoDBMigrator.prototype.migrate = function(type, from) {
    from = from || 0;
    return this.read(type, from).then((function(_this) {
      return function(results) {
        return _this.parse(type, results);
      };
    })(this)).then((function(_this) {
      return function(results) {
        return _this.write(type, results);
      };
    })(this)).then((function(_this) {
      return function(results) {
        return _this.next(type, from, results);
      };
    })(this));
  };

  ElasticsearchToDynamoDBMigrator.prototype.read = function(type, from) {
    debug("Reading " + type + "s from " + from);
    return this.search(type, from).then(function(results) {
      var ref, ref1;
      debug("Read " + results.length + " " + type + "s " + ((ref = _.first(results)) != null ? ref.id : void 0) + " to " + ((ref1 = _.last(results)) != null ? ref1.id : void 0));
      return results;
    });
  };

  ElasticsearchToDynamoDBMigrator.prototype.search = function(type, from) {
    return this.elasticsearch.search({
      index: this.options.elasticsearch.index,
      size: this.options.elasticsearch.size,
      sort: 'id',
      type: type,
      from: from
    }).then(function(result) {
      return P.map(result.hits.hits, function(hit) {
        return hit._source;
      });
    }).then(function(results) {
      return P.each(results, function(result) {
        return result;
      });
    });
  };

  ElasticsearchToDynamoDBMigrator.prototype.parse = function(type, results) {
    var ref, ref1;
    debug("Parsing " + results.length + " " + type + "s " + ((ref = _.first(results)) != null ? ref.id : void 0) + " to " + ((ref1 = _.last(results)) != null ? ref1.id : void 0));
    return P.map(results, (function(_this) {
      return function(result) {
        return _this.parseOne(type, result);
      };
    })(this)).then(function(parsedResults) {
      var ref2, ref3;
      debug("Parsed " + results.length + " " + type + "s " + ((ref2 = _.first(results)) != null ? ref2.id : void 0) + " to " + ((ref3 = _.last(results)) != null ? ref3.id : void 0));
      return parsedResults;
    });
  };

  ElasticsearchToDynamoDBMigrator.prototype.parseOne = function(type, result) {
    if (result.ts) {
      result.ts = moment(result.ts).valueOf();
    }
    if (result.end_ts) {
      result.end_ts = moment(result.end_ts).valueOf();
    }
    if (result.ts_actual) {
      result.ts_actual = moment(result.ts_actual).valueOf();
    }
    if (result.end_ts_actual) {
      result.end_ts_actual = moment(result.end_ts_actual).valueOf();
    }
    return {
      PutRequest: {
        Item: _.extend({
          type: type,
          id: result.id
        }, result)
      }
    };
  };

  ElasticsearchToDynamoDBMigrator.prototype.write = function(type, results) {
    return P.reduce(results, (function(_this) {
      return function(batchedResults, result) {
        var batch;
        batch = _.last(batchedResults);
        if (!batch || batch.length === _this.options.dynamodb.size) {
          batch = [];
          batchedResults.push(batch);
        }
        batch.push(result);
        return batchedResults;
      };
    })(this), []).map((function(_this) {
      return function(batch) {
        return _this.writeBatch(type, batch);
      };
    })(this))["return"](results);
  };

  ElasticsearchToDynamoDBMigrator.prototype.writeBatch = function(type, results) {
    var firstId, lastId, obj, ref, ref1;
    firstId = (ref = _.first(results)) != null ? ref.PutRequest.Item.id : void 0;
    lastId = (ref1 = _.last(results)) != null ? ref1.PutRequest.Item.id : void 0;
    debug("Writing " + results.length + " " + type + "s " + firstId + " to " + lastId);
    P.bind(this);
    return this.dynamodb.batchWriteAsync({
      RequestItems: (
        obj = {},
        obj["" + this.options.dynamodb.table] = results,
        obj
      )
    }).then(function() {
      debug("Wrote " + results.length + " " + type + "s " + firstId + " to " + lastId);
      return results;
    });
  };

  ElasticsearchToDynamoDBMigrator.prototype.next = function(type, from, results) {
    if (results.length < this.options.elasticsearch.size) {
      return;
    }
    return this.migrate(type, from + results.length);
  };

  return ElasticsearchToDynamoDBMigrator;

})();

module.exports = ElasticsearchToDynamoDBMigrator;

//# sourceMappingURL=elasticsearch-dynamodb.js.map
