"use strict";

var fs = require('fs');
var http = require('http');
var ogg = require('ogg');
var stream = require('stream');
var util = require('util');
var validUrl = require('valid-url');
var vorbis = require('vorbis');

function float_to_int(options) {
    this.buff = null;
    stream.Transform.call(this, options);
}
util.inherits(float_to_int, stream.Transform);

float_to_int.prototype._transform = function (chunk, enc, cb) {
    var dest_len = chunk.length/4 * 2;
    this.buff = new Buffer(dest_len);
    for (var i=0, j=0; i<chunk.length; i+=4,j+=2) {
        var f = chunk.readFloatLE(i);
        f = f * 32768;
        if (f > 32767) f = 32767;
        if (f < -32768) f = -32768;

        this.buff.writeInt16LE(Math.floor(f), j);
    }
    this.push(this.buff);
    cb();
};

function seek_counter(seek, options) {
    this.index = 0;
    this.seek = seek;
    stream.Transform.call(this, options);
}
util.inherits(seek_counter, stream.Transform);

seek_counter.prototype._transform = function(chunk, enc, cb) {
    this.index += chunk.length;

    // only push chunks if we've seeked to where we want to be
    if (this.index >= this.seek) {
        this.push(chunk);
    }
    else {
        this.push('');
    }

    cb();
}

function decodeOgg(fileStream, seek, playStream, callback) {
    var od = new ogg.Decoder();
    var pcm = new float_to_int();
    var seeker = new seek_counter(seek);
    od.on('stream', function(stream) {
        var vd = new vorbis.Decoder();
        var stream;
        vd.on('format', function(format) {
            var outputFormat = {
                channels: format.channels,
                sampleRate: format.sampleRate,
                bitDepth: 16, //format.bitDepth,
                signed: format.signed
            };
            stream = vd.pipe(pcm).pipe(seeker);
            stream.on('end', function() {
                callback(null, stream);
            });
            //stream = vd.pipe(pcm);
            playStream(stream, outputFormat);
        });
        vd.on('error', function(e) {
            console.error(e);
            callback(e, stream);
        });

        stream.pipe(vd);
    });
    od.on('error', function(e) {
        console.error(e);
        bot.stopPlaying();
    });

    return fileStream.pipe(od);
}

function fileExists(file) {
    console.log('checking', file);
    try {
        fs.lstatSync(file);
        return true;
    } catch (e) {
        return false;
    }
}

function decodeFileOrStream(uri, seek, playStream, callback) {
    if (validUrl.isUri(uri)) {
        // is a stream, probably
        //return decodeUrl();
    }
    else {
        // it's a file of some kind
        var filestream = fs.createReadStream(uri);

        switch (/.+\.(.+)$/.exec(uri)[1]) {
            case 'ogg':
                return decodeOgg(filestream, seek, playStream, callback);
            default:
                console.error('filetype not recognized:', uri);
                return;
        }
    }
}

module.exports = {
    fileExists: fileExists,
    decodeFileOrStream: decodeFileOrStream
};
