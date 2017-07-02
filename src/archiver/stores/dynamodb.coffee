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
        @db = new AWS.DynamoDB(@options)
        _.extend @, new AWS.DynamoDB.DocumentClient(@options)
        P.promisifyAll @db
        P.promisifyAll @
        @createTable()
        @hours = @options.size / 60 / 6
        debug "Created for #{@stream.key}"

    #----------

    createTable: () ->
        @table = "sm-archiver-#{@stream.key}"
        debug "Creating table #{@table}"
        @db.createTableAsync
            TableName: @table
            KeySchema: [
                {
                    AttributeName: 'type'
                    KeyType: 'HASH'
                }, {
                    AttributeName: 'id'
                    KeyType: 'RANGE'
                },
            ]
            AttributeDefinitions: [
                {
                    AttributeName: 'type'
                    AttributeType: 'S'
                }, {
                    AttributeName: 'id'
                    AttributeType: 'N'
                }
            ]
            ProvisionedThroughput:
                ReadCapacityUnits: 5
                WriteCapacityUnits: 1
        .then () =>
            debug "CREATED table #{@table}"
        .catch (error) =>
            debug "CREATE table Error for #{@table}: #{error}"

    #----------

    indexSegment: (segment) ->
        segment = _.clone segment
        segment.ts = segment.ts.valueOf()
        segment.end_ts = segment.end_ts.valueOf()
        segment.ts_actual = segment.ts_actual.valueOf()
        segment.end_ts_actual = segment.end_ts_actual.valueOf()
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
        @updateAsync
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
            .then (segment) ->
                segment.ts = moment(segment.ts).toDate()
                segment.end_ts = moment(segment.end_ts).toDate()
                segment.ts_actual = moment(segment.ts_actual).toDate()
                segment.end_ts_actual = moment(segment.end_ts_actual).toDate()
                segment

    #----------

    getOne: (type, id, fields) ->
        debug "Getting #{type} #{id} from #{@stream.key}"
        @getAsync
            TableName: @table
            Key:
                type: type
                id: Number(id)
            AttributesToGet: fields
        .then (result) ->
            result.Item
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
            .each (segment) ->
                segment.ts = moment(segment.ts).toDate()
                segment.end_ts = moment(segment.end_ts).toDate()
                segment.ts_actual = moment(segment.ts_actual).toDate()
                segment.end_ts_actual = moment(segment.end_ts_actual).toDate()
                segment

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
        expression = ''
        values = {}
        if options.from
            expression += '#I >= :f'
            values[':f'] = from
        if options.from and options.to
            expression += ' AND'
        if options.to
            expression += '#I < :t'
            values[':t'] = to
        @scanAsync
            TableName: @table
            FilterExpression: expression
            ExpressionAttributeNames:
                '#I': 'id'
            ExpressionAttributeValues: values
        .then (result) ->
            P.map result.Items, (item) ->
                if attribute then item[attribute] else item
        .filter (item) ->
            item
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
