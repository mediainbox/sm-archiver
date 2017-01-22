var Server, _, bodyParser, compression, cors, debug, exportKeys, express, moment, onHeaders;

cors = require("cors");

_ = require("underscore");

moment = require("moment");

express = require("express");

onHeaders = require("on-headers");

bodyParser = require("body-parser");

compression = require("compression");

debug = require("debug")("sm:archiver:server");

exportKeys = ["id", "format", "to", "from"];

Server = (function() {
  function Server(core, options, log) {
    this.core = core;
    this.options = options;
    this.log = log;
    this.app = express();
    this.app.set("x-powered-by", "StreamMachine Archiver");
    this.app.use(cors({
      exposedHeaders: ["X-Archiver-Preview-Length", "X-Archiver-Filename"]
    }));
    this.app.options("*", cors());
    this.app.use((function(_this) {
      return function(req, res, next) {
        req.startTime = process.hrtime();
        onHeaders(res, function() {
          return this.startTime = process.hrtime();
        });
        return next();
      };
    })(this));
    this.app.use((function(_this) {
      return function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        return next();
      };
    })(this));
    this.app.param("stream", (function(_this) {
      return function(req, res, next, key) {
        var s;
        if ((key != null) && (s = _this.core.streams[key])) {
          req.stream = s;
          return next();
        } else {
          return res.status(404).end("Invalid stream.\n");
        }
      };
    })(this));
    this.app.get("/:stream.m3u8", compression({
      filter: function() {
        return true;
      }
    }), (function(_this) {
      return function(req, res) {
        var ref, ref1, ref2, ref3;
        if (((ref = _this.options.outputs) != null ? (ref1 = ref.live) != null ? ref1.enabled : void 0 : void 0) && !req.query.from && !req.query.to) {
          return new _this.core.Outputs.live_streaming.Index(req.stream, {
            req: req,
            res: res
          });
        }
        if (!((ref2 = _this.options.outputs) != null ? (ref3 = ref2.hls) != null ? ref3.enabled : void 0 : void 0) || !req.stream.archiver) {
          return res.status(404).json({
            status: 404,
            error: "Stream not archived"
          });
        }
        return req.stream.archiver.getHls(req.query, function(error, hls) {
          var hlsString;
          if (error) {
            return res.status(500).json({
              status: 500,
              error: (error != null ? error.stack : void 0) || error
            });
          } else if (!hls || !hls.length) {
            return res.status(404).json({
              status: 404,
              error: "Hls not found"
            });
          } else {
            hlsString = hls.toString();
            res.set("Content-Type", "application/vnd.apple.mpegurl");
            res.set("Content-Length", hlsString.length);
            res.set("X-Archiver-Hls-Length", hls.length);
            return res.send(new Buffer(hlsString));
          }
        });
      };
    })(this));
    this.app.get("/:stream/ts/:segment.(:format)", (function(_this) {
      return function(req, res) {
        if (!req.stream.archiver) {
          return res.status(404).json({
            status: 404,
            error: "Stream not archived"
          });
        }
        return req.stream.archiver.getAudio(req.params.segment, req.params.format, function(error, audio) {
          if (error) {
            return res.status(500).json({
              status: 500,
              error: (error != null ? error.stack : void 0) || error
            });
          } else if (!audio) {
            return res.status(404).json({
              status: 404,
              error: "Audio not found"
            });
          } else {
            res.type(req.params.format);
            return res.send(audio);
          }
        });
      };
    })(this));
    this.app.get("/:stream/info", (function(_this) {
      return function(req, res) {
        return res.json({
          format: req.stream.opts.format,
          codec: req.stream.opts.codec,
          archived: req.stream.archiver != null
        });
      };
    })(this));
    this.app.get("/:stream/preview", (function(_this) {
      return function(req, res) {
        if (!req.stream.archiver) {
          return res.status(404).json({
            status: 404,
            error: "Stream not archived"
          });
        }
        return req.stream.archiver.getPreview(req.query, function(error, preview) {
          if (error) {
            return res.status(500).json({
              status: 500,
              error: (error != null ? error.stack : void 0) || error
            });
          } else if (!preview) {
            return res.status(404).json({
              status: 404,
              error: "Preview not found"
            });
          } else {
            res.set("X-Archiver-Preview-Length", preview.length);
            return res.json(preview);
          }
        });
      };
    })(this));
    this.app.get("/:stream/segments/:segment", (function(_this) {
      return function(req, res) {
        if (!req.stream.archiver) {
          return res.status(404).json({
            status: 404,
            error: "Stream not archived"
          });
        }
        return req.stream.archiver.getSegment(req.params.segment, function(error, segment) {
          if (error) {
            return res.status(500).json({
              status: 500,
              error: (error != null ? error.stack : void 0) || error
            });
          } else if (!segment) {
            return res.status(404).json({
              status: 404,
              error: "Segment not found"
            });
          } else {
            return res.json(segment);
          }
        });
      };
    })(this));
    this.app.get("/:stream/waveform/:segment", (function(_this) {
      return function(req, res) {
        if (!req.stream.archiver) {
          return res.status(404).json({
            status: 404,
            error: "Stream not archived"
          });
        }
        return req.stream.archiver.getWaveform(req.params.segment, function(error, waveform) {
          if (error) {
            return res.status(500).json({
              status: 500,
              error: (error != null ? error.stack : void 0) || error
            });
          } else if (!waveform) {
            return res.status(404).json({
              status: 404,
              error: "Waveform not found"
            });
          } else {
            return res.json(waveform);
          }
        });
      };
    })(this));
    this.app.post("/:stream/comments", bodyParser.json(), (function(_this) {
      return function(req, res) {
        if (!req.stream.archiver) {
          return res.status(404).json({
            status: 404,
            error: "Stream not archived"
          });
        }
        return req.stream.archiver.saveComment(req.body, function(error, comment) {
          if (error) {
            return res.status(500).json({
              status: 500,
              error: (error != null ? error.stack : void 0) || error
            });
          } else {
            return res.json(comment);
          }
        });
      };
    })(this));
    this.app.get("/:stream/comments", (function(_this) {
      return function(req, res) {
        if (!req.stream.archiver) {
          return res.status(404).json({
            status: 404,
            error: "Stream not archived"
          });
        }
        return req.stream.archiver.getComments(req.query, function(error, comments) {
          if (error) {
            return res.status(500).json({
              status: 500,
              error: (error != null ? error.stack : void 0) || error
            });
          } else if (!comments) {
            return res.status(404).json({
              status: 404,
              error: "Comments not found"
            });
          } else {
            res.set("X-Archiver-Comments-Length", comments.length);
            return res.json(comments);
          }
        });
      };
    })(this));
    this.app.get("/:stream/comments/:comment", (function(_this) {
      return function(req, res) {
        if (!req.stream.archiver) {
          return res.status(404).json({
            status: 404,
            error: "Stream not archived"
          });
        }
        return req.stream.archiver.getComment(req.params.comment, function(error, comment) {
          if (error) {
            return res.status(500).json({
              status: 500,
              error: (error != null ? error.stack : void 0) || error
            });
          } else if (!comment) {
            return res.status(404).json({
              status: 404,
              error: "Comment not found"
            });
          } else {
            return res.json(comment);
          }
        });
      };
    })(this));
    this.app.get("/:stream/export", compression({
      filter: function() {
        return true;
      }
    }), (function(_this) {
      return function(req, res) {
        var ref, ref1;
        if (!((ref = _this.options.outputs) != null ? (ref1 = ref["export"]) != null ? ref1.enabled : void 0 : void 0) || !req.stream.archiver) {
          return res.status(404).json({
            status: 404,
            error: "Stream not archived"
          });
        } else if (!req.query.from || !req.query.to) {
          return res.status(400).json({
            status: 400,
            error: "Missing parameters"
          });
        }
        return req.stream.archiver.getExport(req.query, function(error, exp) {
          if (error) {
            return res.status(500).json({
              status: 500,
              error: (error != null ? error.stack : void 0) || error
            });
          } else if (!exp || !exp.length) {
            return res.status(404).json({
              status: 404,
              error: "Export not found"
            });
          } else {
            if (req.stream.opts.format === "mp3") {
              res.set("Content-Type", "audio/mpeg");
            } else if (req.stream.opts.format === "aac") {
              res.set("Content-Type", "audio/aacp");
            } else {
              res.set("Content-Type", "unknown");
            }
            res.set("Connection", "close");
            res.set("Content-Length", exp.size);
            res.set("X-Archiver-Export-Length", exp.length);
            res.set("Content-Disposition", "attachment; filename=\"" + exp.filename + "\"");
            res.set("X-Archiver-Filename", exp.filename);
            return exp.pipe(res).end();
          }
        });
      };
    })(this));
    this.app.post("/:stream/export", (function(_this) {
      return function(req, res) {
        var ref, ref1;
        if (!((ref = _this.options.outputs) != null ? (ref1 = ref["export"]) != null ? ref1.enabled : void 0 : void 0) || !req.stream.archiver) {
          return res.status(404).json({
            status: 404,
            error: "Stream not archived"
          });
        } else if (!req.query.from || !req.query.to) {
          return res.status(400).json({
            status: 400,
            error: "Missing parameters"
          });
        }
        return req.stream.archiver.saveExport(req.query, function(error, exp) {
          if (error) {
            return res.status(500).json({
              status: 500,
              error: (error != null ? error.stack : void 0) || error
            });
          } else if (!exp || !exp.length) {
            return res.status(404).json({
              status: 404,
              error: "Export not found"
            });
          } else {
            return res.send(_.pick(exp, exportKeys));
          }
        });
      };
    })(this));
    this.app.get("/:stream/export/:id", (function(_this) {
      return function(req, res) {
        var ref, ref1;
        if (!((ref = _this.options.outputs) != null ? (ref1 = ref["export"]) != null ? ref1.enabled : void 0 : void 0) || !req.stream.archiver) {
          return res.status(404).json({
            status: 404,
            error: "Stream not archived"
          });
        }
        return req.stream.archiver.getExportById(req.params.id, function(error, exp) {
          if (error) {
            return res.status(500).json({
              status: 500,
              error: (error != null ? error.stack : void 0) || error
            });
          } else {
            res.type(req.stream.opts.format);
            return res.send(exp);
          }
        });
      };
    })(this));
    this.app["delete"]("/:stream/export/:id", (function(_this) {
      return function(req, res) {
        var ref, ref1;
        if (!((ref = _this.options.outputs) != null ? (ref1 = ref["export"]) != null ? ref1.enabled : void 0 : void 0) || !req.stream.archiver) {
          return res.status(404).json({
            status: 404,
            error: "Stream not archived"
          });
        }
        return req.stream.archiver.deleteExport(req.params.id, function(error) {
          if (error) {
            return res.status(500).json({
              status: 500,
              error: (error != null ? error.stack : void 0) || error
            });
          } else {
            return res.send({
              message: "ok"
            });
          }
        });
      };
    })(this));
    this.app.get("/:stream/exports", (function(_this) {
      return function(req, res) {
        var ref, ref1;
        if (!((ref = _this.options.outputs) != null ? (ref1 = ref["export"]) != null ? ref1.enabled : void 0 : void 0) || !req.stream.archiver) {
          return res.status(404).json({
            status: 404,
            error: "Stream not archived"
          });
        }
        return req.stream.archiver.getExports(_.extend(req.query, {
          allowUnlimited: true
        }), function(error, exports) {
          if (error) {
            return res.status(500).json({
              status: 500,
              error: (error != null ? error.stack : void 0) || error
            });
          } else {
            return res.send(exports);
          }
        });
      };
    })(this));
    this._server = this.app.listen(this.options.port, (function(_this) {
      return function() {
        return debug("Listing on port " + _this.options.port);
      };
    })(this));
    debug("Created");
  }

  return Server;

})();

module.exports = Server;

//# sourceMappingURL=server.js.map
