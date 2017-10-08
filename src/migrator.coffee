nconf = require 'nconf'
debug = require('debug') 'sm:migrator'
config = require('./config')

class Migrator
    constructor: (@config) ->
        debug 'Created'

    #----------

    initialize: () ->
        @createMigrator()
            .initialize()
            .catch (error) ->
                debug error

    #----------

    createMigrator: () ->
        new (@getMigrator()) @config.migration.options

    #----------

    getMigrator: () ->
        @migrator = @migrator or require "./migrators/#{@config.migration.from}-#{@config.migration.to}"
        @migrator

    #----------

#----------

migrator = new Migrator config
migrator.initialize()

process.on 'uncaughtException', (error) ->
    debug error
    return if "#{error}" is 'Error: got binary data when not reconstructing a packet'
    process.exit 1
