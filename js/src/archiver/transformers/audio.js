var AudioTransformer, PTS_TAG, _, debug, s,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

_ = require("underscore");

debug = require("debug")("sm:archiver:transformers:audio");

PTS_TAG = new Buffer((function() {
  var i, len, ref, results;
  ref = "49 44 33 04 00 00 00 00 00 3F 50 52 49 56 00 00 00 35 00 00 63 6F 6D\n2E 61 70 70 6C 65 2E 73 74 72 65 61 6D 69 6E 67 2E 74 72 61 6E 73 70\n6F 72 74 53 74 72 65 61 6D 54 69 6D 65 73 74 61 6D 70 00 00 00 00 00\n00 00 00 00".split(/\s+/);
  results = [];
  for (i = 0, len = ref.length; i < len; i++) {
    s = ref[i];
    results.push(Number("0x" + s));
  }
  return results;
})());

AudioTransformer = (function(superClass) {
  extend(AudioTransformer, superClass);

  function AudioTransformer(stream) {
    this.stream = stream;
    AudioTransformer.__super__.constructor.call(this, {
      objectMode: true
    });
    debug("Created for " + this.stream.key);
  }

  AudioTransformer.prototype._transform = function(segment, encoding, callback) {
    var duration;
    duration = this.stream.secsToOffset(segment.duration / 1000);
    debug("Segment " + segment.id + " from " + this.stream.key);
    return this.stream._rbuffer.range(segment.ts, duration, (function(_this) {
      return function(error, chunks) {
        var audio, buffers, chunk, i, len, length, meta, tag;
        if (error) {
          console.error("Error getting segment rewind: " + error);
          callback();
          return false;
        }
        buffers = [];
        length = 0;
        duration = 0;
        meta = null;
        tag = null;
        debug(segment.pts);
        if (segment.pts) {
          tag = new Buffer(PTS_TAG);
          if (segment.pts > Math.pow(2, 32) - 1) {
            tag[0x44] = 0x01;
            tag.writeUInt32BE(segment.pts - (Math.pow(2, 32) - 1), 0x45);
          } else {
            tag.writeUInt32BE(segment.pts, 0x45);
          }
        }
        if (tag) {
          buffers.push(tag);
          length += tag.length;
        }
        for (i = 0, len = chunks.length; i < len; i++) {
          chunk = chunks[i];
          length += chunk.data.length;
          duration += chunk.duration;
          buffers.push(chunk.data);
          if (!meta) {
            meta = chunk.meta;
          }
        }
        audio = Buffer.concat(buffers, length);
        _this.push(_.extend(segment, {
          audio: audio,
          duration: duration,
          meta: meta
        }));
        return callback();
      };
    })(this));
  };

  return AudioTransformer;

})(require("stream").Transform);

module.exports = AudioTransformer;

//# sourceMappingURL=audio.js.map
