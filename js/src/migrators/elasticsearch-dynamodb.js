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
    this.dynamodb = new AWS.DynamoDB.DocumentClient(this.options.dynamodb);
    P.promisifyAll(this.dynamodb);
    debug('Created');
  }

  ElasticsearchToDynamoDBMigrator.prototype.initialize = function() {
    debug('Starting to migrate segments');
    return this.migrate('segment').then((function(_this) {
      return function() {
        debug('Starting to migrate exports');
        return _this.migrate('export');
      };
    })(this));
  };

  ElasticsearchToDynamoDBMigrator.prototype.migrate = function(type, from) {
    from = from || 0;
    debug("Searching " + type + "s from " + from);
    return this.search(type, from).then(function(results) {
      var ref, ref1;
      debug("Searched " + results.length + " " + type + "s " + ((ref = _.first(results)) != null ? ref.id : void 0) + " to " + ((ref1 = _.last(results)) != null ? ref1.id : void 0));
      return results;
    }).then((function(_this) {
      return function(results) {
        var ref, ref1;
        debug("Parsing " + results.length + "  " + type + "s " + ((ref = _.first(results)) != null ? ref.id : void 0) + " to " + ((ref1 = _.last(results)) != null ? ref1.id : void 0));
        return _this.parse(type, results).then(function(parsedResults) {
          var ref2, ref3, ref4, ref5;
          debug("Parsed " + results.length + "  " + type + "s " + ((ref2 = _.first(results)) != null ? ref2.id : void 0) + " to " + ((ref3 = _.last(results)) != null ? ref3.id : void 0));
          debug("Writing " + results.length + "  " + type + "s " + ((ref4 = _.first(results)) != null ? ref4.id : void 0) + " to " + ((ref5 = _.last(results)) != null ? ref5.id : void 0));
          return _this.write(parsedResults);
        })["return"](results);
      };
    })(this)).then((function(_this) {
      return function(results) {
        var ref, ref1;
        debug("Wrote " + results.length + " " + type + "s " + ((ref = _.first(results)) != null ? ref.id : void 0) + " to " + ((ref1 = _.last(results)) != null ? ref1.id : void 0));
        if (results.length < _this.options.elasticsearch.size) {
          return;
        }
        return _this.migrate(type, from + results.length);
      };
    })(this));
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
    return P.map(results, (function(_this) {
      return function(result) {
        return _this.parseOne(type, result);
      };
    })(this));
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

  ElasticsearchToDynamoDBMigrator.prototype.write = function(results) {
    var obj;
    return this.dynamodb.batchWriteAsync({
      RequestItems: (
        obj = {},
        obj["" + this.options.dynamodb.table] = results,
        obj
      )
    }).then(function() {
      return debug;
    });
  };

  return ElasticsearchToDynamoDBMigrator;

})();

module.exports = ElasticsearchToDynamoDBMigrator;

//# sourceMappingURL=elasticsearch-dynamodb.js.map
