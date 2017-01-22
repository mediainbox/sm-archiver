_ = require "underscore"
moment = require "moment"
PassThrough = require("stream").PassThrough
debug = require("debug") "sm:archiver:outputs:export"

class ExportOutput
    constructor: (@stream, options) ->
        @id = moment().valueOf()
        @passThrough = new PassThrough objectMode: true
        @audios = []
        @length = 0
        @max = 360
        @size = 0
        @format = @stream.opts.format
        @filename = "#{@stream.key}-#{@id}.#{@format}"
        @passThrough.on "end", @onEnd
        _.extend @, options
        debug "Created for #{@stream.key}"

    #----------

    append: (audios) ->
        return @ if not audios.length or @ended
        _.each audios, (audio) ->
            return if @length == @max
            @audios.push audio
            @length++
            @size += audio.length
        , @
        debug "Current length for #{@stream.key} is #{@length}"
        @

    #----------

    pipe: (to) ->
        @passThrough.pipe to
        _.each @audios, (audio) ->
            @passThrough.write audio
        , @
        @

    #----------

    end: () ->
        @passThrough.end()
        @

    #----------

    onEnd: () =>
        @ended = true
        debug "Ended for #{@stream.key}"
        @

    #----------

    concat: () ->
        Buffer.concat this.audios

    #----------

#----------

module.exports = ExportOutput
