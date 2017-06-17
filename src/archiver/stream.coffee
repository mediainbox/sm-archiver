_ = require 'underscore'
moment = require 'moment'
IdTransformer = require './transformers/id'
AudioTransformer = require './transformers/audio'
WaveformTransformer = require './transformers/waveform'
WavedataTransformer = require './transformers/wavedata'
PreviewTransformer = require './transformers/preview'
MemoryStore = require './stores/memory'
QueueMemoryStoreTransformer = require './transformers/stores/memory/queue'
MemoryStoreTransformer = require './transformers/stores/memory'
ElasticsearchStore = require './stores/elasticsearch'
ElasticsearchStoreTransformer = require './transformers/stores/elasticsearch'
S3Store = require './stores/s3'
S3StoreTransformer = require './transformers/stores/s3'
HlsOutput = require './outputs/hls'
ExportOutput = require './outputs/export'
debug = require('debug') 'sm:archiver:stream'
segmentKeys = [
    'id',
    'ts',
    'end_ts',
    'ts_actual',
    'end_ts_actual',
    'data_length',
    'duration',
    'discontinuitySeq',
    'pts',
    'preview',
    'comment'
]

class StreamArchiver extends require('events').EventEmitter
    constructor: (@stream, @options) ->
        @stores = {}
        @transformers = [
            new AudioTransformer(@stream),
            new WaveformTransformer(@stream, @options.pixels_per_second)
        ]

        if @options.stores?.memory?.enabled
            @stores.memory = new MemoryStore @stream, @options.stores.memory
            @transformers.unshift new QueueMemoryStoreTransformer @stream, @stores.memory
            @transformers.push new MemoryStoreTransformer @stream, @stores.memory

        if @options.stores?.elasticsearch?.enabled
            @stores.elasticsearch = new ElasticsearchStore @stream, @options.stores.elasticsearch
            @transformers.push new ElasticsearchStoreTransformer @stream, @stores.elasticsearch

        if @options.stores?.s3?.enabled
            @stores.s3 = new S3Store @stream, @options.stores.s3
            @transformers.push new S3StoreTransformer @stream, @stores.s3

        @transformers.unshift new IdTransformer @stream

        _.each @transformers, (transformer, index) =>
            previous = @transformers[index - 1]
            if (previous)
                previous.pipe(transformer)

        _.last(@transformers).on 'readable', =>
            while seg = _.last(@transformers).read()
                debug "Segment #{seg.id} archived"

        @stream.source.on 'hls_snapshot', (snapshot) =>
            return debug "HLS Snapshot failed via broadcast from #{@stream.key}" if not snapshot
            debug "HLS Snapshot received via broadcast from #{@stream.key} (#{snapshot.segments.length} segments)"
            @stream.emit 'hls_snapshot', snapshot

        @stream._once_source_loaded =>
            @stream.source.getHLSSnapshot (error, snapshot) =>
                debug "HLS snapshot from initial source load of #{@stream.key} (#{snapshot.segments.length} segments)"
                @stream.emit 'hls_snapshot', snapshot

        @stream.on 'hls_snapshot', (snapshot) =>
            for segment in snapshot.segments
                _.first(@transformers).write segment

        debug "Created for #{@stream.key}"

    #----------

    getSegments: (options, callback) ->
        @getSegmentsFromMemory options, (error, segments) =>
            return callback error, segments if error or (segments and segments.length)
            @getSegmentsFromElasticsearch options, null, (error, segments) ->
                return callback error, segments if error or (segments and segments.length)
                return callback null, []

    #----------

    getSegmentsFromMemory: (options, callback) ->
        return callback() if not @stores.memory
        callback null, @stores.memory.getSegments(options)

    #----------

    getSegmentsFromElasticsearch: (options, attribute, callback) ->
        return callback() if not @stores.elasticsearch
        @stores.elasticsearch.getSegments(options, attribute)
            .then((segments) -> return callback null, segments)
            .catch(() -> callback())

    #----------

    getSegment: (id, callback) ->
        @getSegmentFromMemory id, (error, segment) =>
            return callback error, (_.pick(segment, segmentKeys.concat(['waveform'])) if segment) if error or segment
            @getSegmentFromElasticsearch id, (error, segment) ->
                return callback error, (_.pick(segment, segmentKeys.concat(['waveform'])) if segment)

    #----------

    getSegmentFromMemory: (id, callback) ->
        return callback() if not @stores.memory
        callback null, @stores.memory.getSegment(id)

    #----------

    getSegmentFromElasticsearch: (id, callback) ->
        return callback() if not @stores.elasticsearch
        @stores.elasticsearch.getSegment(id)
        .then((segment) -> return callback null, segment)
        .catch(() -> callback())

    #----------

    getPreview: (options, callback) ->
        @getSegments options, (error, segments) =>
            return callback error, segments if error or not segments or not segments.length
            @generatePreview segments, (error, preview) ->
                return callback error, preview if error or (preview and preview.length)
                return callback null, []

    #----------

    generatePreview: (segments, callback) ->
        preview = []
        return callback(null, preview) if not segments.length
        wavedataTransformer = new WavedataTransformer @stream
        previewTransformer = new PreviewTransformer @stream, @options.preview_width, segments.length
        wavedataTransformer.pipe previewTransformer
        previewTransformer.on 'readable', ->
            while segment = previewTransformer.read()
                preview.push _.pick(segment, segmentKeys)
        previewTransformer.on 'end', ->
            callback null, preview
        _.each segments, (segment) ->
            try
                wavedataTransformer.write segment
            catch e
                debug e
        previewTransformer.end()

    #----------

    getWaveform: (id, callback) ->
        @getWaveformFromMemory id, (error, waveform) =>
            return callback error, waveform if error or waveform
            @getWaveformFromElasticsearch id, callback

    #----------

    getWaveformFromMemory: (id, callback) ->
        return callback() if not @stores.memory
        callback null, @stores.memory.getWaveform(id)

    #----------

    getWaveformFromElasticsearch: (id, callback) ->
        return callback() if not @stores.elasticsearch
        @stores.elasticsearch.getSegment(id) \
            .then((segment) -> return callback null, segment?.waveform) \
            .catch(() -> callback())

    #----------

    getAudio: (id, format, callback) ->
        @getAudioFromMemory id, format, (error, audio) =>
            return callback error, audio if error or audio
            @getAudioFromS3 id, format, callback

    #----------

    getAudioFromMemory: (id, format, callback) ->
        return callback() if not @stores.memory
        callback null, @stores.memory.getAudio(id)

    #----------

    getAudioFromS3: (id, format, callback) ->
        return callback() if not @stores.s3
        @stores.s3.getAudioById(id, format) \
            .then((audio) -> return callback null, audio) \
            .catch(() -> callback())

    #----------

    getAudios: (options, callback) ->
        @getAudiosFromMemory options, (error, audios) =>
            return callback error, audios if error or (audios and audios.length)
            @getAudiosFromS3 options, (error, audios) ->
                return callback error, audios if error or (audios and audios.length)
                return callback null, []

    #----------

    getAudiosFromMemory: (options, callback) ->
        return callback() if not @stores.memory
        callback null, @stores.memory.getSegments(options).map (segment) ->
            audio = segment.audio
            audio.segment = segment
            audio

    #----------

    getAudiosFromS3: (options, callback) ->
        return callback() if not @stores.s3
        @getSegmentsFromElasticsearch options, null, (error, segments) =>
            return callback error, [] if error or not segments or not segments.length
            @stores.s3.getAudiosBySegments(segments)
                .then((audios) -> return callback null, audios)
                .catch((error) -> callback(error))

    #----------

    getComment: (id, callback) ->
        @getCommentFromMemory id, (error, comment) ->
            return callback error, comment if error or comment
        @getCommentFromElasticsearch id, callback

    #----------

    getCommentFromMemory: (id, callback) ->
        return callback() if not @stores.memory
        callback null, @stores.memory.getComment(id)

    #----------

    getCommentFromElasticsearch: (id, callback) ->
        return callback() if not @stores.elasticsearch
        @stores.elasticsearch.getSegment(id) \
        .then((segment) -> return callback null, segment?.comment) \
        .catch(() -> callback())

    #----------

    getComments: (options, callback) ->
        @getCommentsFromElasticsearch options, (error, comments) ->
            return callback error, comments if error or (comments and comments.length)
            return callback null, []

    #----------

    getCommentsFromElasticsearch: (options, callback) ->
        return callback() if not @stores.elasticsearch
        @stores.elasticsearch.getComments(options) \
        .then((comments) -> callback null, comments)
        .catch callback

    #----------

    saveComment: (comment, callback) ->
        @saveCommentToMemory comment, (error, comment) =>
            return callback error, comment if error
            @saveCommentToElasticsearch comment, callback

    #----------

    saveCommentToMemory: (comment, callback) ->
        return callback null, comment if not @stores.memory
        @stores.memory.storeComment comment
        callback null, comment

    #----------

    saveCommentToElasticsearch: (comment, callback) ->
        return callback null, comment if not @stores.elasticsearch
        @stores.elasticsearch.indexComment(comment) \
        .then(() -> callback null, comment)
        .catch callback

    #----------

    getHls: (options, callback) ->
        @getSegments options, (error, segments) =>
            return callback error, segments if error or not segments or not segments.length
            @generateHls segments, callback

    #----------

    generateHls: (segments, callback) ->
        hls = new HlsOutput @stream
        try
            callback null, hls.append(segments).end()
        catch error
            callback error

    #----------

    getExport: (options, callback) ->
        @getAudios options, (error, audios) =>
            return callback error, audios if error or not audios or not audios.length
            @generateExport audios, options, callback

    #----------

    generateExport: (audios, options, callback) ->
        callback null, (new ExportOutput @stream, options).append(audios).trim()

    #----------

    saveExport: (options, callback) ->
        @getExport options, (error, exp) =>
            return callback error, exp if error or not exp or not exp.length
            @saveExportToS3 exp, (error, exp) =>
                return callback error, exp if error
                @saveExportToElasticsearch exp, callback

    #----------

    saveExportToS3: (exp, callback) ->
        return callback() if not @stores.s3
        @stores.s3.putExport(exp)
            .then(() -> callback null, exp)
            .catch callback

    #----------

    saveExportToElasticsearch: (exp, callback) ->
        return callback null, exp if not @stores.elasticsearch
        @stores.elasticsearch.indexExport(exp)
            .then(() -> callback null, exp)
            .catch callback

    #----------

    getExportById: (id, callback) ->
        @getExportByIdFromS3 id, callback

    #----------

    getExportByIdFromS3: (id, callback) ->
        return callback() if not @stores.s3
        @stores.s3.getExportById(id)
            .then((exp) -> callback null, exp)
            .catch callback

    #----------

    deleteExport: (id, callback) ->
        @deleteExportFromElasticsearch id, (error) =>
            return callback error if error
            @deleteExportFromS3 id, callback

    #----------

    deleteExportFromElasticsearch: (id, callback) ->
        return callback() if not @stores.elasticsearch
        @stores.elasticsearch.deleteExport(id)
            .then(() -> callback())
            .catch callback

    #----------

    deleteExportFromS3: (id, callback) ->
        return callback() if not @stores.s3
        @stores.s3.deleteExport(id)
            .then(() -> callback())
            .catch callback

    #----------

    getExports: (options, callback) ->
        @getExportsFromElasticsearch options, (error, exports) ->
            return callback error, exports if error or (exports and exports.length)
            return callback null, []

    #----------

    getExportsFromElasticsearch: (options, callback) ->
        return callback() if not @stores.elasticsearch
        @stores.elasticsearch.getExports(options) \
            .then((exports) -> callback null, exports)
            .catch callback

    #----------

#----------

module.exports = StreamArchiver
