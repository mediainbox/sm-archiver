_ = require "underscore"
debug = require("debug") "sm:archiver:transformers:audio"

PTS_TAG = new Buffer(Number("0x#{s}") for s in """
    49 44 33 04 00 00 00 00 00 3F 50 52 49 56 00 00 00 35 00 00 63 6F 6D
    2E 61 70 70 6C 65 2E 73 74 72 65 61 6D 69 6E 67 2E 74 72 61 6E 73 70
    6F 72 74 53 74 72 65 61 6D 54 69 6D 65 73 74 61 6D 70 00 00 00 00 00
    00 00 00 00
    """.split(/\s+/))

class AudioTransformer extends require("stream").Transform
    constructor: (@stream) ->
        super objectMode: true
        debug "Created for #{@stream.key}"

    #----------

    _transform: (segment, encoding, callback) ->
        duration = @stream.secsToOffset segment.duration / 1000
        debug "Segment #{segment.id} from #{@stream.key}"
        @stream._rbuffer.range segment.ts, duration, (error, chunks) =>
            if error
                console.error "Error getting segment rewind: #{error}"
                callback()
                return false
            buffers = []
            length = 0
            duration = 0
            meta = null
            tag = null
            debug segment.pts
            if segment.pts
                tag = new Buffer(PTS_TAG)
                if segment.pts > Math.pow(2,32)-1
                    tag[0x44] = 0x01
                    tag.writeUInt32BE(segment.pts-(Math.pow(2,32)-1),0x45)
                else
                    tag.writeUInt32BE(segment.pts,0x45)
            if tag
                buffers.push tag
                length += tag.length
            for chunk in chunks
                length += chunk.data.length
                duration += chunk.duration
                buffers.push chunk.data
                meta = chunk.meta if !meta
            audio = Buffer.concat buffers, length
            @push _.extend(segment, audio: audio, duration: duration, meta: meta)
            callback()

    #----------

#----------

module.exports = AudioTransformer
