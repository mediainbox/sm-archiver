#SlaveIO = require 'streammachine/js/src/streammachine/slave/slave_io'
Logger = require 'streammachine/js/src/streammachine/logger'
StreamArchiver = require './stream'
Server = require './server'
#Monitors = require './monitors'
debug = require('debug') 'sm:archiver'

class Archiver extends require 'streammachine/js/src/streammachine/slave'
    constructor: (@options) ->
        @streams = {}
        @stream_groups = {}
        @root_route = null
        @connected = false
        @_retrying = null
        @log = new Logger stdout: true
        #@io = new SlaveIO @, @log.child(module: 'io'), @options.master
#
#        @io.on 'connected', ->
#            debug 'Connected to master'
#        @io.on 'disconnected', ->
#            debug 'Disconnected from master'

        key = @options.streams[0]

        keyParts = key.match /(.*)\.(\w{3})$/i
        format = if keyParts then keyParts[2] else 'mp3'

        stream =
            key: key
            opts:
                format: format
                codec: null

        @streams = {}
        @streams[stream.key] = stream

        stream.archiver = new StreamArchiver stream, @options

#        @once 'streams', =>
#            console.log(@streams);process.exit();
#            @_configured = true
#            for key, stream of @streams
#                if @options.streams?.length > 0 and @options.streams.indexOf(key) is -1
#                    continue
#                do (key, stream) =>
#                    debug "Creating StreamArchiver for #{key}"
#                    stream.archiver = new StreamArchiver stream, @options

        @server = new Server @, @options, @log.child(component: 'server')
        #@monitors = new Monitors @, @server, @options
        debug 'Created'

    #----------

#----------

module.exports = Archiver
