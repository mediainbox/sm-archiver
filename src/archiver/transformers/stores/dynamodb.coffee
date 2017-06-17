debug = require('debug') 'sm:archiver:transformers:dynamodb'

class DynamoDBStoreTransformer extends require('stream').Transform
    constructor: (@stream, @dynamodb) ->
        super objectMode: true
        debug "Created for #{@stream.key}"

    #----------

    _transform: (segment, encoding, callback) ->
        debug "Segment #{segment.id} from #{@stream.key}"
        @dynamodb.indexSegment(segment).then =>
            @push segment
            callback()

    #----------

#----------

module.exports = DynamoDBStoreTransformer
