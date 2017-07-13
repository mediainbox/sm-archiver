P = require 'bluebird'
AWS = require 'aws-sdk'
_ = require 'underscore'
moment = require 'moment'
elasticsearch = require 'elasticsearch'
debug = require('debug') 'sm:migrators:elasticsearch-dynamodb'

class ElasticsearchToDynamoDBMigrator
    constructor: (@options) ->
        @elasticsearch = new elasticsearch.Client _.clone @options.elasticsearch
        @db = new AWS.DynamoDB @options.dynamodb
        @dynamodb = new AWS.DynamoDB.DocumentClient @options.dynamodb
        P.promisifyAll @db
        P.promisifyAll @dynamodb
        debug 'Created'

    #----------

    initialize: () ->
        @createTable()
        .then () =>
            debug 'Starting to migrate segments'
            @migrate 'segment'
        .then () =>
            debug 'Starting to migrate exports'
            @migrate 'export'

    #----------

    createTable: () ->
        debug "Creating table #{@options.dynamodb.table}"
        @db.createTableAsync
            TableName: @options.dynamodb.table
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
            debug "CREATED table #{@options.dynamodb.table}"
        .catch (error) =>
            debug "CREATE table Error for #{@options.dynamodb.table}: #{error}"

    #----------

    migrate: (type, from) ->
        from = from or 0
        @read type, from
        .then (results) =>
            @parse type, results
        .then (results) =>
            @write type, results
        .then (results) =>
            @next type, from, results

    #----------

    read: (type, from) ->
        debug "Reading #{type}s from #{from}"
        @search type, from
        .then (results) ->
            debug "Read #{results.length} #{type}s #{_.first(results)?.id} to #{_.last(results)?.id}"
            results

    #----------

    search: (type, from) ->
        @elasticsearch.search
            index: @options.elasticsearch.index
            size: @options.elasticsearch.size
            sort: 'id'
            type: type
            from: from
        .then (result) ->
            P.map result.hits.hits, (hit) ->
                hit._source
        .then (results) ->
            P.each results, (result) ->
                result

    #----------

    parse: (type, results) ->
        debug "Parsing #{results.length} #{type}s #{_.first(results)?.id} to #{_.last(results)?.id}"
        P.map results, (result) =>
            @parseOne type, result
        .then (parsedResults) ->
            debug "Parsed #{results.length} #{type}s #{_.first(results)?.id} to #{_.last(results)?.id}"
            parsedResults

    #----------

    parseOne: (type, result) ->
        if result.ts then result.ts = moment(result.ts).valueOf()
        if result.end_ts then result.end_ts = moment(result.end_ts).valueOf()
        if result.ts_actual then result.ts_actual = moment(result.ts_actual).valueOf()
        if result.end_ts_actual then result.end_ts_actual = moment(result.end_ts_actual).valueOf()
        PutRequest:
            Item: _.extend
                type: type,
                id: result.id,
                result

    #----------

    write: (type, results) ->
        P.reduce results, (batchedResults, result) =>
            batch = _.last(batchedResults)
            if not batch or batch.length is @options.dynamodb.size
                batch = []
                batchedResults.push batch
            batch.push result
            batchedResults
        , []
        .map (batch) =>
            @writeBatch type, batch
        .return results

    #----------

    writeBatch: (type, results) ->
        firstId = _.first(results)?.PutRequest.Item.id
        lastId = _.last(results)?.PutRequest.Item.id
        debug "Writing #{results.length} #{type}s #{firstId} to #{lastId}"
        P.bind(@)
#        @dynamodb.batchWriteAsync
#            RequestItems:
#                "#{@options.dynamodb.table}": results
        .then () ->
            debug "Wrote #{results.length} #{type}s #{firstId} to #{lastId}"
            results



    #----------

    next: (type, from, results) ->
        return if results.length < @options.elasticsearch.size
        @migrate type, from + results.length

    #----------

#----------

module.exports = ElasticsearchToDynamoDBMigrator
