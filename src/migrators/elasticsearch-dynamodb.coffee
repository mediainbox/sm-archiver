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
        debug "Searching #{type}s from #{from}"
        @search type, from
        .then (results) ->
            debug "Searched #{results.length} #{type}s #{_.first(results)?.id} to #{_.last(results)?.id}"
            results
        .then (results) =>
            debug "Parsing #{results.length} #{type}s #{_.first(results)?.id} to #{_.last(results)?.id}"
            @parse type, results
            .then (parsedResults) =>
                debug "Parsed #{results.length} #{type}s #{_.first(results)?.id} to #{_.last(results)?.id}"
                debug "Writing #{results.length} #{type}s #{_.first(results)?.id} to #{_.last(results)?.id}"
                @write parsedResults
            .return results
        .then (results) =>
            debug "Wrote #{results.length} #{type}s #{_.first(results)?.id} to #{_.last(results)?.id}"
            return if results.length < @options.elasticsearch.size
            @migrate type, from + results.length

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
        P.map results, (result) =>
            @parseOne type, result

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

    write: (results) ->
        @dynamodb.batchWriteAsync
            RequestItems:
                "#{@options.dynamodb.table}": results

    #----------

#----------

module.exports = ElasticsearchToDynamoDBMigrator
