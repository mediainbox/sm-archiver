debug = require('debug') 'sm:archiver:transformers:memory'

class MemoryStoreTransformer extends require('stream').Transform
    constructor: (@stream, @memory, @options) ->
        super objectMode: true
        debug "Created for #{@stream.key}"

    #----------

    _transform: (segment, encoding, callback) ->
        debug "Segment #{segment.id} from #{@stream.key}"
        @memory.storeSegment segment
        @push segment
        callback()

    #----------

#----------

module.exports = MemoryStoreTransformer
