debug = require('debug') 'sm:archiver:transformers:dates'

class DatesTransformer extends require('stream').Transform
    constructor: (@stream) ->
        super objectMode: true
        debug "Created for #{@stream.key}"

    #----------

    _transform: (segment, encoding, callback) ->
        debug "Segment #{segment.id} from #{@stream.key}"
        segment.ts = segment.ts.valueOf()
        segment.end_ts = segment.end_ts.valueOf()
        segment.ts_actual = segment.ts_actual.valueOf()
        segment.end_ts_actual = segment.end_ts_actual.valueOf()
        @push segment
        callback()

    #----------

#----------

module.exports = DatesTransformer
