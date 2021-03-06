require('./gcloud-tools')
heapdump = require('heapdump')
request = require 'request'
debug = require('debug') 'sm:archiver:runner'
config = require('./config')

class Runner
    constructor: (@config) ->
        debug 'Created'

    #----------

    initialize: () ->
        @getRadio (radio) =>
            @ping()
            @createArchiver radio

    #----------

    getRadio: (callback) ->
        request.get(@config.uri,
            json: true,
            qs: ping: 'archiver'
        , (error, response, body) =>
            if error
                debug error
                return @retry callback
            if not body
                debug 'No radio available'
                return @retry callback
            callback body
        )

    #----------

    retry: (callback) ->
        setTimeout () =>
            debug 'Retry'
            @getRadio callback
        , @config.ping / 2

    #----------

    createArchiver: (@radio) ->
        new (@getArchiver()) @radio.options

    #----------

    getArchiver: () ->
        @archiver = @archiver or require './archiver'
        @archiver

    #----------

    ping: () ->
        setTimeout () =>
            debug 'Ping'
            request.put @config.uri,
                qs: ping: 'archiver', name: @radio.name
            , () =>
                @ping()
        , @config.ping

    #----------

#----------


runner = new Runner config
runner.initialize()

process.on 'uncaughtException', (error) ->
    debug error
    return if "#{error}" is 'Error: got binary data when not reconstructing a packet'
    process.exit 1
