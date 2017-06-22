var HlsOutput, _, debug, m3u, moment;

m3u = require('m3u');

_ = require('underscore');

moment = require('moment');

debug = require('debug')('sm:archiver:outputs:hls');

HlsOutput = (function() {
  function HlsOutput(stream) {
    this.stream = stream;
    _.extend(this, m3u.httpLiveStreamingWriter());
    this.version(3);
    this.targetDuration(10);
    this.length = 0;
    this.max = 360;
    debug("Created for " + this.stream.key);
  }

  HlsOutput.prototype.append = function(segments) {
    if (!segments.length || this.ended) {
      return this;
    }
    if (!this.length) {
      this.mediaSequence(_.first(segments).id);
      this.comment('EXT-X-INDEPENDENT-SEGMENTS');
    }
    _.each(segments, (function(_this) {
      return function(segment) {
        var ts;
        if (_this.length === _this.max) {
          return;
        }
        ts = segment.ts instanceof moment ? segment.ts : moment(segment.ts);
        _this.programDateTime(ts.format());
        _this.file("/" + _this.stream.key + "/ts/" + segment.id + "." + _this.stream.opts.format, segment.duration / 1000);
        return _this.length++;
      };
    })(this));
    debug("Current length for " + this.stream.key + " is " + this.length);
    return this;
  };

  HlsOutput.prototype.end = function() {
    this.ended = true;
    this.endlist();
    debug("Ended for " + this.stream.key);
    return this;
  };

  return HlsOutput;

})();

module.exports = HlsOutput;

//# sourceMappingURL=hls.js.map
