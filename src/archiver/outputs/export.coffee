_ = require 'underscore'
moment = require 'moment'
PassThrough = require('stream').PassThrough
debug = require('debug') 'sm:archiver:outputs:export'

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
        @passThrough.on 'end', @onEnd
        _.extend @, options
        debug "Created for #{@stream.key}"

    #----------

    append: (audios) ->
        return @ if not audios.length or @ended
        _.each audios, (audio) =>
            return if @length is @max
            if not @length
                @first = audio
            @audios.push audio
            @length++
            @size += audio.length
            @last = audio
        debug "Current length for #{@stream.key} is #{@length}"
        @

    #----------

    trim: () ->
        if @offsetFrom
            firstOld = @audios[0].length
            @audios[0] = @first.slice(@offsetFrom * @first.length / @first.segment.duration)
            @size -= firstOld - @audios[0].length
        if @offsetTo
            lastOld = @audios[@length - 1].length
            @audios[@length - 1] = @last.slice(0, -(@offsetTo * @last.length / @last.segment.duration))
            @size -= lastOld - @audios[@length - 1].length
        @

    #----------

    pipe: (to) ->
        @passThrough.pipe to
        _.each @audios, (audio) =>
            @passThrough.write audio
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
        Buffer.concat @audios

    #----------

#----------

module.exports = ExportOutput
