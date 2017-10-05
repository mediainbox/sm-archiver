cors = require 'cors'
_ = require 'underscore'
moment = require 'moment'
express = require 'express'
onHeaders = require 'on-headers'
sizeof = require 'object-sizeof'
bodyParser = require 'body-parser'
compression = require 'compression'
debug = require('debug') 'sm:archiver:server'
exportKeys = [
    'id',
    'format',
    'to',
    'from'
]
CACHE_HEADER = 'Cache-Control'
CACHE = 'max-age=3600, smax-age=86400'
CACHE_30_SECONDS = 'max-age=30'
NO_CACHE = 'max-age=0, no-cache, must-revalidate'

class Server
    constructor: (@core, @options, @log) ->
        @app = express()
        @app.set 'x-powered-by', 'StreamMachine Archiver'
        @app.use cors(exposedHeaders: ['X-Archiver-Preview-Length', 'X-Archiver-Filename'])
        @app.options '*', cors()

        @app.use (req, res, next) ->
            req.startTime = process.hrtime()
            onHeaders res, ->
                @startTime = process.hrtime()
            next()

        @app.use (req, res, next) ->
            res.header('Access-Control-Allow-Origin', '*')
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
            next()

        @app.param 'stream', (req, res, next, key) =>
            if key? and s = @core.streams[key]
                req.stream = s
                next()
            else
                res.status(404).end 'Invalid stream.\n'

        @app.get '/:stream.m3u8', compression(filter: -> true), (req, res) =>
            if @options.outputs?.live?.enabled and not req.query.from and not req.query.to
                return new @core.Outputs.live_streaming.Index req.stream, req: req, res: res
            if not @options.outputs?.hls?.enabled or not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            req.stream.archiver.getHls req.query, (error, hls) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else if not hls or not hls.length
                    res.status(404).json status: 404, error: 'Hls not found'
                else
                    hlsString = hls.toString()
                    res.set 'Content-Type', 'application/vnd.apple.mpegurl'
                    res.set 'Content-Length', hlsString.length
                    res.set 'X-Archiver-Hls-Length', hls.length
                    res.send new Buffer hlsString

        @app.get '/:stream/ts/:segment.(:format)', (req, res) ->
            if not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            req.stream.archiver.getAudio req.params.segment, req.params.format, (error, audio) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else if not audio
                    res.status(404).json status: 404, error: 'Audio not found'
                else
                    res.type req.params.format
                    res.set CACHE_HEADER, CACHE
                    res.send audio

        @app.get '/:stream/info', (req, res) ->
            res.set CACHE_HEADER, NO_CACHE
            info =
                format: req.stream.opts.format,
                codec: req.stream.opts.codec,
                archived: req.stream.archiver?,
                stores: {},
                memory: process.memoryUsage()
            if info.archived
                _.each req.stream.archiver.stores, (store, name) ->
                    info.stores[name] = true
                if info.stores.memory
                    info.memory.cache = sizeof req.stream.archiver.stores.memory.segments
            res.json info

        @app.get '/:stream/preview', (req, res) ->
            if not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            req.stream.archiver.getPreview req.query, (error, preview) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else if not preview
                    res.status(404).json status: 404, error: 'Preview not found'
                else
                    res.set 'X-Archiver-Preview-Length', preview.length
                    res.set CACHE_HEADER, NO_CACHE
                    res.json preview

        @app.get '/:stream/preview-last-hour', (req, res) ->
            previewParams =
                from: moment().subtract(1, 'hours').valueOf()
                to: moment().valueOf()

            if not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            req.stream.archiver.getPreview previewParams, (error, preview) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else if not preview
                    res.status(404).json status: 404, error: 'Preview not found'
                else
                    res.set 'X-Archiver-Preview-Length', preview.length
                    res.set CACHE_HEADER, CACHE_30_SECONDS
                    res.json preview

        @app.get '/:stream/segments/:segment', (req, res) ->
            if not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            req.stream.archiver.getSegment req.params.segment, (error, segment) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else if not segment
                    res.status(404).json status: 404, error: 'Segment not found'
                else
                    res.set CACHE_HEADER, NO_CACHE
                    res.json segment

        @app.get '/:stream/waveform/:segment', (req, res) ->
            if not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            req.stream.archiver.getWaveform req.params.segment, (error, waveform) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else if not waveform
                    res.status(404).json status: 404, error: 'Waveform not found'
                else
                    res.set CACHE_HEADER, NO_CACHE
                    res.json waveform

        @app.post '/:stream/comments', bodyParser.json(), (req, res) ->
            if not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            req.stream.archiver.saveComment req.body, (error, comment) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else
                    res.set CACHE_HEADER, NO_CACHE
                    res.json comment

        @app.get '/:stream/comments', (req, res) ->
            if not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            req.stream.archiver.getComments req.query, (error, comments) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else if not comments
                    res.status(404).json status: 404, error: 'Comments not found'
                else
                    res.set 'X-Archiver-Comments-Length', comments.length
                    res.set CACHE_HEADER, NO_CACHE
                    res.json comments

        @app.get '/:stream/comments/:comment', (req, res) ->
            if not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            req.stream.archiver.getComment req.params.comment, (error, comment) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else if not comment
                    res.status(404).json status: 404, error: 'Comment not found'
                else
                    res.set CACHE_HEADER, NO_CACHE
                    res.json comment

        @app.get '/:stream/export', compression(filter: -> true), (req, res) =>
            if not @options.outputs?.export?.enabled or not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            else if not req.query.from or not req.query.to
                return res.status(400).json status: 400, error: 'Missing parameters'
            req.stream.archiver.getExport req.query, (error, exp) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else if not exp or not exp.length
                    res.status(404).json status: 404, error: 'Export not found'
                else
                    if req.stream.opts.format is 'mp3' then res.set 'Content-Type', 'audio/mpeg'
                    else if req.stream.opts.format is 'aac' then res.set 'Content-Type', 'audio/aacp'
                    else res.set 'Content-Type', 'unknown'
                    res.set 'Connection', 'close'
                    res.set 'Content-Length', exp.size
                    res.set 'X-Archiver-Export-Length', exp.length
                    res.set 'Content-Disposition', "attachment; filename=\"#{exp.filename}\""
                    res.set 'X-Archiver-Filename', exp.filename
                    res.set CACHE_HEADER, CACHE
                    exp.pipe(res).end()

        @app.post '/:stream/export', (req, res) =>
            if not @options.outputs?.export?.enabled or not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            else if not req.query.from or not req.query.to
                return res.status(400).json status: 400, error: 'Missing parameters'
            req.stream.archiver.saveExport req.query, (error, exp) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else if not exp or not exp.length
                    res.status(404).json status: 404, error: 'Export not found'
                else
                    res.set CACHE_HEADER, NO_CACHE
                    res.json _.pick exp, exportKeys

        @app.get '/:stream/export/:id', (req, res) =>
            if not @options.outputs?.export?.enabled or not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            req.stream.archiver.getExportById req.params.id, (error, exp) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else
                    res.type req.stream.opts.format
                    res.set CACHE_HEADER, CACHE
                    res.send exp

        @app.delete '/:stream/export/:id', (req, res) ->
            if not @options.outputs?.export?.enabled or not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            req.stream.archiver.deleteExport req.params.id, (error) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else
                    res.send message: 'ok'

        @app.get '/:stream/exports', (req, res) =>
            if not @options.outputs?.export?.enabled or not req.stream.archiver
                return res.status(404).json status: 404, error: 'Stream not archived'
            req.stream.archiver.getExports _.extend(req.query, allowUnlimited: true), (error, exports) ->
                if error
                    res.status(500).json status: 500, error: error?.stack or error
                else
                    res.set CACHE_HEADER, NO_CACHE
                    res.json exports

        @_server = @app.listen @options.port, () =>
            debug "Listing on port #{@options.port}"

        debug 'Created'

    #----------

#----------

module.exports = Server
