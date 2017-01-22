P = require "bluebird"
AWS = require "aws-sdk"
_ = require "underscore"
moment = require "moment"
debug = require("debug") "sm:archiver:stores:s3"

class S3Store
    constructor: (@stream, @options) ->
        _.extend(@, new AWS.S3 @options)
        P.promisifyAll @
        @prefix = "sm-archiver/#{@stream.key}"
        @format = @stream.opts.format
        debug "Created for #{@stream.key}"

    #----------

    getAudioById: (id, format) =>
        return P.resolve() if format and format != @format
        @getFile("audio/#{id}.#{format or @format}") \
            .then (data) => data.Body

    #----------

    getAudiosByIds: (ids) ->
        return P.map(
            ids, (id) => @getAudioById(id).catch(->)
        )
        .filter (audio) -> audio

    #----------

    getExportById: (id, format) =>
        return P.resolve() if format and format != @format
        @getFile("exports/#{id}.#{format or @format}") \
            .then (data) => data.Body

    #----------

    putExport: (exp, options) =>
        @putFile "exports/#{exp.id}.#{@format}", exp.concat(), options

    #----------

    deleteExport: (id, options) =>
        @deleteFile "exports/#{id}.#{@stream.opts.format}"

    #----------

    getFile: (key) ->
        key = "#{@prefix}/#{key}"
        debug "Getting #{key}"
        @getObjectAsync(Key: key) \
            .catch (error) =>
                debug "GET Error for #{key}: #{error}"
                throw error

    #----------

    putFileIfNotExists: (name, body, options) ->
        key = "#{@prefix}/#{name}"
        @headObjectAsync(Key: key) \
            .then(() => debug "Skipping #{key}")
            .catch (error) =>
                if error.statusCode != 404
                    return debug "HEAD Error for #{key}: #{error}"
                @putFile name, body, options

    #----------

    putFile: (name, body, options) ->
        key = "#{@prefix}/#{name}"
        debug "Storing #{key}"
        @putObjectAsync(_.extend({}, options || {}, Key: key, Body: body)) \
            .catch (error) ->
                debug "PUT Error for #{key}: #{error}"

    #----------

    deleteFile: (name, options) ->
        key = "#{@prefix}/#{name}"
        debug "Deleting #{key}"
        @deleteObjectAsync(_.extend({}, options || {}, Key: key)) \
            .catch (error) ->
                debug "DELETE Error for #{key}: #{error}"

    #----------

#----------

module.exports = S3Store
