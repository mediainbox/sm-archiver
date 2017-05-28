P = require "bluebird"
_ = require "underscore"
moment = require "moment"
elasticsearch = require "elasticsearch"
debug = require("debug") "sm:archiver:stores:elasticsearch"
R_TIMESTAMP = /^[1-9][0-9]*$/
segmentKeys = [
    "id",
    "ts",
    "end_ts",
    "ts_actual",
    "end_ts_actual",
    "data_length",
    "duration",
    "discontinuitySeq",
    "pts",
    "waveform",
    "comment"
]
exportKeys = [
    "id",
    "format",
    "to",
    "from"
]

class ElasticsearchStore
    constructor: (@stream, options) ->
        @options = _.clone options
        _.extend @, new elasticsearch.Client(@options)
        @hours = @options.size / 60 / 6
        debug "Created for #{@stream.key}"

    #----------

    indexSegment: (segment) ->
        @indexOne "segment", segment.id, _.pick(segment, segmentKeys)

    #----------

    indexComment: (comment) ->
        @updateOne "segment", comment.id, comment: comment

    #----------

    indexExport: (exp) ->
        @indexOne "export", exp.id, _.pick(exp, exportKeys)

    #----------

    deleteExport: (id) ->
        @deleteOne "export", id

    #----------

    indexOne: (type, id, body) ->
        debug "Indexing #{type} #{id}"
        @index(index: @stream.key, type: type, id: id, body: body)
            .catch (error) =>
                debug "INDEX #{type} Error for #{@stream.key}/#{id}: #{error}"

    #----------

    updateOne: (type, id, doc) ->
        debug "Updating #{type} #{id}"
        @update(index: @stream.key, type: type, id: id, body: doc: doc)
            .catch (error) =>
                debug "UPDATE #{type} Error for #{@stream.key}/#{id}: #{error}"

    #----------

    getSegment: (id, fields) ->
        @getOne "segment", id, fields

    #----------

    getOne: (type, id, fields) ->
        debug "Getting #{type} #{id} from #{@stream.key}"
        @get(index: @stream.key, type: type, id: id, fields: fields)
            .then((result) => result._source )
            .catch (error) =>
                debug "GET #{type} Error for #{@stream.key}/#{id}: #{error}"

    #----------

    deleteOne: (type, id) ->
        debug "Deleting #{type} #{id} from #{@stream.key}"
        @delete(index: @stream.key, type: type, id: id)
            .catch (error) =>
                debug "DELETE #{type} Error for #{@stream.key}/#{id}: #{error}"

    #----------

    getSegments: (options, attribute) ->
        @getMany "segment", options, attribute

    #----------

    getComments: (options) ->
        @getMany "segment", options, "comment"

    #----------

    getExports: (options) ->
        @getMany "export", options

    #----------

    getMany: (type, options, attribute) ->
        first = moment().subtract(@hours, 'hours').valueOf()
        last = moment().valueOf()
        from = @parseId options.from, first
        to = @parseId options.to, last
        debug "Searching #{attribute or type} #{from} -> #{to} from #{@stream.key}"
        query = {
            range: {
                id: {
                    gte: from,
                    lt: to
                }
            }
        }
        if options.allowUnlimited and not options.from and not options.to
            query = undefined
        else if options.from or options.to
            query.range.id.gte = options.from
            query.range.id.lt = options.to or last
        @search(index: @stream.key, type: type, body: {
            size: @options.size,
            sort: "id",
            query: query
        })
        .then((result) =>
            P.map(result.hits.hits, (hit) =>
                if attribute then hit._source?[attribute] else hit._source
            )
        )
        .catch (error) =>
            debug "SEARCH #{attribute or type} Error for #{@stream.key}: #{error}"

    #----------

    parseId: (id, defaultId) ->
        if not id
            return defaultId
        if R_TIMESTAMP.test(id)
            return Number(id)
        moment(id).valueOf()

    #----------

#----------

module.exports = ElasticsearchStore
