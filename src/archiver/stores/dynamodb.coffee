P = require 'bluebird'
AWS = require 'aws-sdk'
_ = require 'underscore'
moment = require 'moment'
debug = require('debug') 'sm:archiver:stores:dynamodb'
R_TIMESTAMP = /^[1-9][0-9]*$/
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
    'waveform',
    'comment'
]
exportKeys = [
    'id',
    'format',
    'to',
    'from'
]

class DynamoDBStore
    constructor: (@stream, @options) ->
        _.extend @, new AWS.DynamoDB.DocumentClient(@options)
        P.promisifyAll @
        @table = "sm-archiver-#{@stream.key}"
        @hours = @options.size / 60 / 6
        debug "Created for #{@stream.key}"

    #----------

    indexSegment: (segment) ->
        debug _.pick(segment, segmentKeys)
        @indexOne 'segment', segment.id, _.pick(segment, segmentKeys)

    #----------

    indexComment: (comment) ->
        @updateOne 'segment', comment.id, 'comment', comment

    #----------

    indexExport: (exp) ->
        @indexOne 'export', exp.id, _.pick(exp, exportKeys)

    #----------

    deleteExport: (id) ->
        @deleteOne 'export', id

    #----------

    indexOne: (type, id, body) ->
        debug "Indexing #{type} #{id}"
        @putAsync
            TableName: @table
            Item: _.extend
                type: type
                id: id
                body
        .catch (error) =>
            debug "INDEX #{type} Error for #{@stream.key}/#{id}: #{error}"

    #----------

    updateOne: (type, id, name, value) ->
        debug "Updating #{type} #{id}"
        @updateItemAsync
            TableName: @table
            Key:
                type: type,
                id: id
            ExpressionAttributeNames:
                '#N': name
            ExpressionAttributeValues:
                ':v': value
            UpdateExpression: 'SET #N = :v'
        .catch (error) =>
            debug "UPDATE #{type} Error for #{@stream.key}/#{id}: #{error}"

    #----------

    getSegment: (id, fields) ->
        @getOne 'segment', id, fields

    #----------

    getOne: (type, id, fields) ->
        debug "Getting #{type} #{id} from #{@stream.key}"
        @getAsync
            TableName: @table
            Key:
                type: type
                id: id
            AttributesToGet: fields
        .then (result) ->
            result._source
        .catch (error) =>
            debug "GET #{type} Error for #{@stream.key}/#{id}: #{error}"

    #----------

    deleteOne: (type, id) ->
        debug "Deleting #{type} #{id} from #{@stream.key}"
        @deleteAsync
            TableName: @table
            Key:
                type: type
                id: id
        .catch (error) =>
            debug "DELETE #{type} Error for #{@stream.key}/#{id}: #{error}"

    #----------

    getSegments: (options, attribute) ->
        @getMany 'segment', options, attribute

    #----------

    getComments: (options) ->
        @getMany 'segment', options, 'comment'

    #----------

    getExports: (options) ->
        @getMany 'export', options

    #----------

    getMany: (type, options, attribute) ->
        first = moment().subtract(@hours, 'hours').valueOf()
        last = moment().valueOf()
        from = @parseId options.from, first
        to = @parseId options.to, last
        debug "Searching #{attribute or type} #{from} -> #{to} from #{@stream.key}"
        expression = '#I'
        if options.from
            expression += ' >= :f'
        if options.from and options.to
            expression += ' AND'
        if option.to
            expression += ' < :t'
        @scanAsync
            TableName: @table
            FilterExpression: expression
            ExpressionAttributeNames:
                '#I': 'id'
            ExpressionAttributeValues:
                ':f': from
                ':t': to
        .then (result) ->
            P.map result.Items, (item) ->
                if attribute then item[attribute] else item
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

module.exports = DynamoDBStore
