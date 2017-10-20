var AudioTransformer, DynamoDBStore, DynamoDBStoreTransformer, ElasticsearchStore, ElasticsearchStoreTransformer, ExportOutput, HlsOutput, IdTransformer, MemoryStore, MemoryStoreTransformer, PreviewTransformer, QueueMemoryStoreTransformer, S3Store, S3StoreTransformer, StreamArchiver, WavedataTransformer, WaveformTransformer, _, debug, moment, segmentKeys,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

_ = require('underscore');

moment = require('moment');

IdTransformer = require('./transformers/id');

AudioTransformer = require('./transformers/audio');

WaveformTransformer = require('./transformers/waveform');

WavedataTransformer = require('./transformers/wavedata');

PreviewTransformer = require('./transformers/preview');

MemoryStore = require('./stores/memory');

QueueMemoryStoreTransformer = require('./transformers/stores/memory/queue');

MemoryStoreTransformer = require('./transformers/stores/memory');

ElasticsearchStore = require('./stores/elasticsearch');

ElasticsearchStoreTransformer = require('./transformers/stores/elasticsearch');

DynamoDBStore = require('./stores/dynamodb');

DynamoDBStoreTransformer = require('./transformers/stores/dynamodb');

S3Store = require('./stores/s3');

S3StoreTransformer = require('./transformers/stores/s3');

HlsOutput = require('./outputs/hls');

ExportOutput = require('./outputs/export');

debug = require('debug')('sm:archiver:stream');

segmentKeys = ['id', 'ts', 'end_ts', 'ts_actual', 'end_ts_actual', 'data_length', 'duration', 'discontinuitySeq', 'pts', 'preview', 'comment'];

StreamArchiver = (function(superClass) {
  extend(StreamArchiver, superClass);

  function StreamArchiver(stream, options1) {
    var ref, ref1, ref2, ref3, ref4, ref5, ref6, ref7;
    this.stream = stream;
    this.options = options1;
    this.stores = {};
    this.transformers = [new AudioTransformer(this.stream), new WaveformTransformer(this.stream, this.options.pixels_per_second)];
    if ((ref = this.options.stores) != null ? (ref1 = ref.memory) != null ? ref1.enabled : void 0 : void 0) {
      this.stores.memory = new MemoryStore(this.stream, this.options.stores.memory);
      this.transformers.unshift(new QueueMemoryStoreTransformer(this.stream, this.stores.memory));
      this.transformers.push(new MemoryStoreTransformer(this.stream, this.stores.memory));
    }
    if ((ref2 = this.options.stores) != null ? (ref3 = ref2.elasticsearch) != null ? ref3.enabled : void 0 : void 0) {
      this.stores.elasticsearch = new ElasticsearchStore(this.stream, this.options.stores.elasticsearch);
      this.transformers.push(new ElasticsearchStoreTransformer(this.stream, this.stores.elasticsearch));
    }
    if ((ref4 = this.options.stores) != null ? (ref5 = ref4.dynamodb) != null ? ref5.enabled : void 0 : void 0) {
      this.stores.dynamodb = new DynamoDBStore(this.stream, this.options.stores.dynamodb);
      this.transformers.push(new DynamoDBStoreTransformer(this.stream, this.stores.dynamodb));
    }
    if ((ref6 = this.options.stores) != null ? (ref7 = ref6.s3) != null ? ref7.enabled : void 0 : void 0) {
      this.stores.s3 = new S3Store(this.stream, this.options.stores.s3);
      this.transformers.push(new S3StoreTransformer(this.stream, this.stores.s3));
    }
    this.transformers.unshift(new IdTransformer(this.stream));
    _.each(this.transformers, (function(_this) {
      return function(transformer, index) {
        var previous;
        previous = _this.transformers[index - 1];
        if (previous) {
          return previous.pipe(transformer);
        }
      };
    })(this));
    _.last(this.transformers).on('readable', (function(_this) {
      return function() {
        var results, seg;
        results = [];
        while (seg = _.last(_this.transformers).read()) {
          results.push(debug("Segment " + seg.id + " archived"));
        }
        return results;
      };
    })(this));
    this.stream.source.on('hls_snapshot', (function(_this) {
      return function(snapshot) {
        if (!snapshot) {
          return debug("HLS Snapshot failed via broadcast from " + _this.stream.key);
        }
        debug("HLS Snapshot received via broadcast from " + _this.stream.key + " (" + snapshot.segments.length + " segments)");
        return _this.stream.emit('hls_snapshot', snapshot);
      };
    })(this));
    this.stream._once_source_loaded((function(_this) {
      return function() {
        return _this.stream.source.getHLSSnapshot(function(error, snapshot) {
          if (!snapshot) {
            return debug("HLS Snapshot failed from initial source load of " + _this.stream.key);
          }
          debug("HLS snapshot from initial source load of " + _this.stream.key + " (" + snapshot.segments.length + " segments)");
          return _this.stream.emit('hls_snapshot', snapshot);
        });
      };
    })(this));
    this.stream.on('hls_snapshot', (function(_this) {
      return function(snapshot) {
        var i, len, ref8, results, segment;
        ref8 = snapshot.segments;
        results = [];
        for (i = 0, len = ref8.length; i < len; i++) {
          segment = ref8[i];
          results.push(_.first(_this.transformers).write(segment));
        }
        return results;
      };
    })(this));
    debug("Created for " + this.stream.key);
  }

  StreamArchiver.prototype.getSegments = function(_options, callback) {
    var options;
    options = _.extend({}, _options);
    if (options.minutesLength) {
      options.to = moment().valueOf();
      if (!options.from) {
        options.from = moment().subtract(parseInt(options.minutesLength), 'minutes').valueOf();
      }
      delete options.minutesLength;
    }
    return this.getSegmentsFromMemory(options, (function(_this) {
      return function(error, segments) {
        if (error || (segments && segments.length)) {
          return callback(error, segments);
        }
        return _this.getSegmentsFromStore(options, callback);
      };
    })(this));
  };

  StreamArchiver.prototype.getSegmentsFromMemory = function(options, callback) {
    if (!this.stores.memory) {
      return callback();
    }
    return callback(null, this.stores.memory.getSegments(options));
  };

  StreamArchiver.prototype.getSegmentsFromStore = function(options, callback) {
    return this.getSegmentsFromElasticsearch(options, null, (function(_this) {
      return function(error, segments) {
        if (error || (segments && segments.length)) {
          return callback(error, segments);
        }
        return _this.getSegmentsFromDynamoDB(options, null, function(error, segments) {
          if (error || (segments && segments.length)) {
            return callback(error, segments);
          }
          return callback(null, []);
        });
      };
    })(this));
  };

  StreamArchiver.prototype.getSegmentsFromElasticsearch = function(options, attribute, callback) {
    if (!this.stores.elasticsearch) {
      return callback();
    }
    return this.stores.elasticsearch.getSegments(options, attribute).then(function(segments) {
      return callback(null, segments);
    })["catch"](function() {
      return callback();
    });
  };

  StreamArchiver.prototype.getSegmentsFromDynamoDB = function(options, attribute, callback) {
    if (!this.stores.dynamodb) {
      return callback();
    }
    return this.stores.dynamodb.getSegments(options, attribute).then(function(segments) {
      return callback(null, segments);
    })["catch"](function() {
      return callback();
    });
  };

  StreamArchiver.prototype.getSegment = function(id, callback) {
    return this.getSegmentFromMemory(id, (function(_this) {
      return function(error, segment) {
        if (error || segment) {
          return callback(error, (segment ? _.pick(segment, segmentKeys.concat(['waveform'])) : void 0));
        }
        return _this.getSegmentFromElasticsearch(id, function(error, segment) {
          if (error || segment) {
            return callback(error, (segment ? _.pick(segment, segmentKeys.concat(['waveform'])) : void 0));
          }
          return _this.getSegmentFromDynamoDB(id, function(error, segment) {
            return callback(error, (segment ? _.pick(segment, segmentKeys.concat(['waveform'])) : void 0));
          });
        });
      };
    })(this));
  };

  StreamArchiver.prototype.getSegmentFromMemory = function(id, callback) {
    if (!this.stores.memory) {
      return callback();
    }
    return callback(null, this.stores.memory.getSegment(id));
  };

  StreamArchiver.prototype.getSegmentFromElasticsearch = function(id, callback) {
    if (!this.stores.elasticsearch) {
      return callback();
    }
    return this.stores.elasticsearch.getSegment(id).then(function(segment) {
      return callback(null, segment);
    })["catch"](function() {
      return callback();
    });
  };

  StreamArchiver.prototype.getSegmentFromDynamoDB = function(id, callback) {
    if (!this.stores.dynamodb) {
      return callback();
    }
    return this.stores.dynamodb.getSegment(id).then(function(segment) {
      return callback(null, segment);
    })["catch"](function() {
      return callback();
    });
  };

  StreamArchiver.prototype.getPreview = function(options, callback) {
    return this.getSegments(options, (function(_this) {
      return function(error, segments) {
        if (error || !segments || !segments.length) {
          return callback(error, segments);
        }
        return _this.generatePreview(segments, function(error, preview) {
          if (error || (preview && preview.length)) {
            return callback(error, preview);
          }
          return callback(null, []);
        });
      };
    })(this));
  };

  StreamArchiver.prototype.generatePreview = function(segments, callback) {
    var preview, previewTransformer, wavedataTransformer;
    preview = [];
    if (!segments.length) {
      return callback(null, preview);
    }
    wavedataTransformer = new WavedataTransformer(this.stream);
    previewTransformer = new PreviewTransformer(this.stream, this.options.preview_width, segments.length);
    wavedataTransformer.pipe(previewTransformer);
    previewTransformer.on('readable', function() {
      var results, segment;
      results = [];
      while (segment = previewTransformer.read()) {
        results.push(preview.push(_.pick(segment, segmentKeys)));
      }
      return results;
    });
    previewTransformer.on('end', function() {
      return callback(null, preview);
    });
    _.each(segments, function(segment) {
      var error, error1;
      try {
        return wavedataTransformer.write(segment);
      } catch (error1) {
        error = error1;
        return debug(error);
      }
    });
    return previewTransformer.end();
  };

  StreamArchiver.prototype.getWaveform = function(id, callback) {
    return this.getWaveformFromMemory(id, (function(_this) {
      return function(error, waveform) {
        if (error || waveform) {
          return callback(error, waveform);
        }
        return _this.getWaveformFromElasticsearch(id, function(error, waveform) {
          if (error || waveform) {
            return callback(error, waveform);
          }
          return _this.getWaveformFromDynamoDB(id, callback);
        });
      };
    })(this));
  };

  StreamArchiver.prototype.getWaveformFromMemory = function(id, callback) {
    if (!this.stores.memory) {
      return callback();
    }
    return callback(null, this.stores.memory.getWaveform(id));
  };

  StreamArchiver.prototype.getWaveformFromElasticsearch = function(id, callback) {
    if (!this.stores.elasticsearch) {
      return callback();
    }
    return this.stores.elasticsearch.getSegment(id).then(function(segment) {
      return callback(null, segment != null ? segment.waveform : void 0);
    })["catch"](function() {
      return callback();
    });
  };

  StreamArchiver.prototype.getWaveformFromDynamoDB = function(id, callback) {
    if (!this.stores.dynamodb) {
      return callback();
    }
    return this.stores.dynamodb.getSegment(id).then(function(segment) {
      return callback(null, segment != null ? segment.waveform : void 0);
    })["catch"](function() {
      return callback();
    });
  };

  StreamArchiver.prototype.getAudio = function(id, format, callback) {
    return this.getAudioFromMemory(id, format, (function(_this) {
      return function(error, audio) {
        if (error || audio) {
          return callback(error, audio);
        }
        return _this.getAudioFromS3(id, format, callback);
      };
    })(this));
  };

  StreamArchiver.prototype.getAudioFromMemory = function(id, format, callback) {
    if (!this.stores.memory) {
      return callback();
    }
    return callback(null, this.stores.memory.getAudio(id));
  };

  StreamArchiver.prototype.getAudioFromS3 = function(id, format, callback) {
    if (!this.stores.s3) {
      return callback();
    }
    return this.stores.s3.getAudioById(id, format).then(function(audio) {
      return callback(null, audio);
    })["catch"](function() {
      return callback();
    });
  };

  StreamArchiver.prototype.getAudios = function(options, callback) {
    return this.getAudiosFromMemory(options, (function(_this) {
      return function(error, audios) {
        if (error || (audios && audios.length)) {
          return callback(error, audios);
        }
        return _this.getAudiosFromS3(options, function(error, audios) {
          if (error || (audios && audios.length)) {
            return callback(error, audios);
          }
          return callback(null, []);
        });
      };
    })(this));
  };

  StreamArchiver.prototype.getAudiosFromMemory = function(options, callback) {
    if (!this.stores.memory) {
      return callback();
    }
    return callback(null, this.stores.memory.getSegments(options).map(function(segment) {
      var audio;
      audio = segment.audio;
      audio.segment = segment;
      return audio;
    }));
  };

  StreamArchiver.prototype.getAudiosFromS3 = function(options, callback) {
    if (!this.stores.s3) {
      return callback();
    }
    return this.getSegmentsFromStore(options, (function(_this) {
      return function(error, segments) {
        if (error || !segments || !segments.length) {
          return callback(error, []);
        }
        return _this.stores.s3.getAudiosBySegments(segments).then(function(audios) {
          return callback(null, audios);
        })["catch"](function(error) {
          return callback(error);
        });
      };
    })(this));
  };

  StreamArchiver.prototype.getComment = function(id, callback) {
    return this.getCommentFromMemory(id, (function(_this) {
      return function(error, comment) {
        if (error || comment) {
          return callback(error, comment);
        }
        return _this.getCommentFromElasticsearch(id, function(error, comment) {
          if (error || comment) {
            return callback(error, comment);
          }
          return _this.getCommentFromDynamoDB(id, callback);
        });
      };
    })(this));
  };

  StreamArchiver.prototype.getCommentFromMemory = function(id, callback) {
    if (!this.stores.memory) {
      return callback();
    }
    return callback(null, this.stores.memory.getComment(id));
  };

  StreamArchiver.prototype.getCommentFromElasticsearch = function(id, callback) {
    if (!this.stores.elasticsearch) {
      return callback();
    }
    return this.stores.elasticsearch.getSegment(id).then(function(segment) {
      return callback(null, segment != null ? segment.comment : void 0);
    })["catch"](function() {
      return callback();
    });
  };

  StreamArchiver.prototype.getCommentFromDynamoDB = function(id, callback) {
    if (!this.stores.dynamodb) {
      return callback();
    }
    return this.stores.dynamodb.getSegment(id).then(function(segment) {
      return callback(null, segment != null ? segment.comment : void 0);
    })["catch"](function() {
      return callback();
    });
  };

  StreamArchiver.prototype.getComments = function(options, callback) {
    return this.getCommentsFromElasticsearch(options, (function(_this) {
      return function(error, comments) {
        if (error || (comments && comments.length)) {
          return callback(error, comments);
        }
        return _this.getCommentsFromDynamoDB(options, function(error, comments) {
          if (error || (comments && comments.length)) {
            return callback(error, comments);
          }
          return callback(null, []);
        });
      };
    })(this));
  };

  StreamArchiver.prototype.getCommentsFromElasticsearch = function(options, callback) {
    if (!this.stores.elasticsearch) {
      return callback();
    }
    return this.stores.elasticsearch.getComments(options).then(function(comments) {
      return callback(null, comments);
    })["catch"](callback);
  };

  StreamArchiver.prototype.getCommentsFromDynamoDB = function(options, callback) {
    if (!this.stores.dynamodb) {
      return callback();
    }
    return this.stores.dynamodb.getComments(options).then(function(comments) {
      return callback(null, comments);
    })["catch"](callback);
  };

  StreamArchiver.prototype.saveComment = function(comment, callback) {
    return this.saveCommentToMemory(comment, (function(_this) {
      return function(error, comment) {
        if (error) {
          return callback(error, comment);
        }
        return _this.saveCommentToElasticsearch(comment, function(error, comment) {
          if (error) {
            return callback(error, comment);
          }
          return _this.saveCommentToDynamoDB(comment, callback);
        });
      };
    })(this));
  };

  StreamArchiver.prototype.saveCommentToMemory = function(comment, callback) {
    if (!this.stores.memory) {
      return callback(null, comment);
    }
    this.stores.memory.storeComment(comment);
    return callback(null, comment);
  };

  StreamArchiver.prototype.saveCommentToElasticsearch = function(comment, callback) {
    if (!this.stores.elasticsearch) {
      return callback(null, comment);
    }
    return this.stores.elasticsearch.indexComment(comment).then(function() {
      return callback(null, comment);
    })["catch"](callback);
  };

  StreamArchiver.prototype.saveCommentToDynamoDB = function(comment, callback) {
    if (!this.stores.dynamodb) {
      return callback(null, comment);
    }
    return this.stores.dynamodb.indexComment(comment).then(function() {
      return callback(null, comment);
    })["catch"](callback);
  };

  StreamArchiver.prototype.getHls = function(options, callback) {
    return this.getSegments(options, (function(_this) {
      return function(error, segments) {
        if (error || !segments || !segments.length) {
          return callback(error, segments);
        }
        return _this.generateHls(segments, callback);
      };
    })(this));
  };

  StreamArchiver.prototype.generateHls = function(segments, callback) {
    var error, error1, hls;
    hls = new HlsOutput(this.stream);
    try {
      return callback(null, hls.append(segments).end());
    } catch (error1) {
      error = error1;
      return callback(error);
    }
  };

  StreamArchiver.prototype.getExport = function(options, callback) {
    return this.getAudios(options, (function(_this) {
      return function(error, audios) {
        if (error || !audios || !audios.length) {
          return callback(error, audios);
        }
        return _this.generateExport(audios, options, callback);
      };
    })(this));
  };

  StreamArchiver.prototype.generateExport = function(audios, options, callback) {
    return callback(null, (new ExportOutput(this.stream, options)).append(audios).trim());
  };

  StreamArchiver.prototype.saveExport = function(options, callback) {
    return this.getExport(options, (function(_this) {
      return function(error, exp) {
        if (error || !exp || !exp.length) {
          return callback(error, exp);
        }
        return _this.saveExportToS3(exp, function(error, exp) {
          if (error) {
            return callback(error, exp);
          }
          return _this.saveExportToElasticsearch(exp, function(error, exp) {
            if (error) {
              return callback(error, exp);
            }
            return _this.saveExportToDynamoDB(exp, callback);
          });
        });
      };
    })(this));
  };

  StreamArchiver.prototype.saveExportToS3 = function(exp, callback) {
    if (!this.stores.s3) {
      return callback();
    }
    return this.stores.s3.putExport(exp).then(function() {
      return callback(null, exp);
    })["catch"](callback);
  };

  StreamArchiver.prototype.saveExportToElasticsearch = function(exp, callback) {
    if (!this.stores.elasticsearch) {
      return callback(null, exp);
    }
    return this.stores.elasticsearch.indexExport(exp).then(function() {
      return callback(null, exp);
    })["catch"](callback);
  };

  StreamArchiver.prototype.saveExportToDynamoDB = function(exp, callback) {
    if (!this.stores.dynamodb) {
      return callback(null, exp);
    }
    return this.stores.dynamodb.indexExport(exp).then(function() {
      return callback(null, exp);
    })["catch"](callback);
  };

  StreamArchiver.prototype.getExportById = function(id, callback) {
    return this.getExportByIdFromS3(id, callback);
  };

  StreamArchiver.prototype.getExportByIdFromS3 = function(id, callback) {
    if (!this.stores.s3) {
      return callback();
    }
    return this.stores.s3.getExportById(id).then(function(exp) {
      return callback(null, exp);
    })["catch"](callback);
  };

  StreamArchiver.prototype.deleteExport = function(id, callback) {
    return this.deleteExportFromElasticsearch(id, (function(_this) {
      return function(error) {
        if (error) {
          return callback(error);
        }
        return _this.deleteExportFromS3(id, callback);
      };
    })(this));
  };

  StreamArchiver.prototype.deleteExportFromElasticsearch = function(id, callback) {
    if (!this.stores.elasticsearch) {
      return callback();
    }
    return this.stores.elasticsearch.deleteExport(id).then(function() {
      return callback();
    })["catch"](callback);
  };

  StreamArchiver.prototype.deleteExportFromS3 = function(id, callback) {
    if (!this.stores.s3) {
      return callback();
    }
    return this.stores.s3.deleteExport(id).then(function() {
      return callback();
    })["catch"](callback);
  };

  StreamArchiver.prototype.getExports = function(options, callback) {
    return this.getExportsFromElasticsearch(options, (function(_this) {
      return function(error, exports) {
        if (error || (exports && exports.length)) {
          return callback(error, exports);
        }
        return _this.getExportsFromDynamoDB(options, function(error, exports) {
          if (error || (exports && exports.length)) {
            return callback(error, exports);
          }
          return callback(null, []);
        });
      };
    })(this));
  };

  StreamArchiver.prototype.getExportsFromElasticsearch = function(options, callback) {
    if (!this.stores.elasticsearch) {
      return callback();
    }
    return this.stores.elasticsearch.getExports(options).then(function(exports) {
      return callback(null, exports);
    })["catch"](callback);
  };

  StreamArchiver.prototype.getExportsFromDynamoDB = function(options, callback) {
    if (!this.stores.dynamodb) {
      return callback();
    }
    return this.stores.dynamodb.getExports(options).then(function(exports) {
      return callback(null, exports);
    })["catch"](callback);
  };

  return StreamArchiver;

})(require('events').EventEmitter);

module.exports = StreamArchiver;

//# sourceMappingURL=stream.js.map
