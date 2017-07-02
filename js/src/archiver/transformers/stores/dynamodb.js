var DynamoDBStoreTransformer, debug,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

debug = require('debug')('sm:archiver:transformers:dynamodb');

DynamoDBStoreTransformer = (function(superClass) {
  extend(DynamoDBStoreTransformer, superClass);

  function DynamoDBStoreTransformer(stream, dynamodb) {
    this.stream = stream;
    this.dynamodb = dynamodb;
    DynamoDBStoreTransformer.__super__.constructor.call(this, {
      objectMode: true
    });
    debug("Created for " + this.stream.key);
  }

  DynamoDBStoreTransformer.prototype._transform = function(segment, encoding, callback) {
    debug("Segment " + segment.id + " from " + this.stream.key);
    return this.dynamodb.indexSegment(segment).then((function(_this) {
      return function() {
        _this.push(segment);
        return callback();
      };
    })(this));
  };

  return DynamoDBStoreTransformer;

})(require('stream').Transform);

module.exports = DynamoDBStoreTransformer;

//# sourceMappingURL=dynamodb.js.map
