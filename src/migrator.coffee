nconf = require 'nconf'
debug = require('debug') 'sm:migrator'

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

nconf.env().argv()
if config = nconf.get('config') or nconf.get('CONFIG')
    nconf.file file: config
migrator = new Migrator nconf.get()
migrator.initialize()
process.on 'uncaughtException', (error) ->
    debug error
    return if "#{error}" is 'Error: got binary data when not reconstructing a packet'
    process.exit 1
