#!/usr/bin/env node

"use strict";

var mumble = require('mumble');
var ogg = require('ogg');
var vorbis = require('vorbis');
var fs = require('fs');
var striptags = require('striptags');
var stream = require('stream');
var util = require('util');
var buffer = require('buffer');
var R = require('ramda');

var argv = require('yargs')
    .usage('Usage: $0 [options] [script1 script2 ...]')
    .alias('s', 'server')
    .describe('s', 'Connect to server')
    .alias('c', 'command')
    .describe('c', 'Run a command when started')
    .help('h')
    .alias('h', 'help')
    .argv;

var config = {};

class Bot {
    constructor(config, connection) {
        this.connection = connection;
        this.config = config;
        this.channel = null;
        this.audioInput = null;
        this.volume = null;
    };

    whisper(username, message) {
        this.connection.userByName(username).sendMessage(message);
    };

    get isPlaying() {
        return this.audioInput !== null;
    };

    stopPlaying() {
        if (this.audioInput !== null) {
            this.audioInput.close();
            this.audioInput = null;
        }
    };
}

var bot = undefined;

var commands = {};
var playlist = [];
var current = null;
var last_stopped = null;
var current_volume;

var default_config = {
    name: 'Botman',
    server: 'mumble://127.0.0.1',
    default_volume: 2.5,
    message_max: 5000,
    mpd_stream: 'http://localhost:6601'
};

var shortcuts = {
    s: 'stop',
    r: 'resume',
    ql: 'queuelist',
    qc: 'queueclear',
    h: 'help',
    pl: 'playlist',
    ls: 'playlist',
    v: 'volume',
    vd: 'volumedefault',
    m: 'mpc'
};


function connect() {
    // load all extension/config scripts
    var scripts = R.map(x => require(__dirname + '/' + x), argv._);

    // merge all configs in order (with defaults first in case things are missing)
    config = R.mergeAll(R.prepend(default_config, R.map(R.propOr({}, 'config'), scripts)));

    // merge all commands in order
    commands = R.mergeAll(R.prepend(commands, R.map(R.propOr({}, 'commands'), scripts)));

    // get all args that are longer than two (yargs has aliases) and merge them with the config
    var flags = R.filter(function(x) { return x.length>2; }, R.keys(argv));
    config = R.merge(config, R.pick(flags, argv));

    mumble.connect(config.server, config.tls, function(error, connection) {
        if (error) { throw new Error(error); }

        connection.on('initialized', function() {
            console.log('Connected successfully');
            bot = new Bot(config, connection);

            connection.on('message', on_message);
            connection.on('move', function(oldChannel, newChannel) {
                bot.channel = newChannel;
            });

            if (config.channel) {
                console.log('Joining channel', config.channel);
                connection.channelByName(config.channel).join();
            }

            if (config.command) { // run init command if specified
                console.log('running', config.command, 'from user', connection.user.name);
                on_message(config.command, connection.user);
            }
        });

        connection.authenticate(config.name, config.password);
    });
}

function on_message(message, user, scope) {
    console.log(user.name, 'said', message);

    var msg = striptags(message.replace(/&quot;/g, '"'));
    var command_re = /^([+!@#])(\w+)?(.*)$/;
    var match = command_re.exec(msg);
    if (!match) {
        //console.log('ignoring badly formatted message', e.Message);
        return;
    }
    var mode = match[1];
    var command = match[2];
    var rest = match[3];

    switch (mode) {
        case '@':
            rest = command + ' ' + rest;
            command = 'play';
            break;
        case '#':
            rest = command + ' ' + rest + ' interrupt';
            command = 'play';
            break;
        case '+':
            rest = command + ' ' + rest;
            command = 'queue';
            break;
    }

    if (!command) {
        return;
    }

    var args = rest.match(/"[^"]*"|[^\s"]+/g);
    if (args !== null) {
        for (var i=0; i<args.length; i++) {
            var str = args[i];
            if (str.charAt(0) === '"' && str.charAt(str.length -1) === '"')
            {
                args[i] = str.substr(1,str.length -2);
            }
        }
    }
    else {
        args = [];
    }

    if (shortcuts[command]) {
        command = shortcuts[command];
    }

    if (commands['c_' + command]) {
        commands['c_' + command](user, args);
    }
}

commands.h_help='Print this help message.';
commands.c_help = function(user, args) {
    var result = [];
    for (var command in commands) {
        if (command.slice(0,2) == 'c_') {
            var base = command.slice(2,command.length);
            var help = commands['h_' + base];
            result.push('<b>!' + base + '</b> ' + help);
        }
    }
    result.sort();
    user.sendMessage('Available commands:<br/>' + result.join('<br/>'));
}

commands.h_stop='Stop playing sound. Use !resume to resume.'
commands.c_stop = function(user, args) {
    if (bot.isPlaying) {
        var at = bot.stopPlaying();
        if (!current.interrupt && (!args || args[0] === undefined)) {
            last_stopped = current;
            last_stopped.at = at;
            console.log('User', user.name, 'stopped', current.filename, 'at', at);
        }
        current = null;
    }
}

commands.h_play='Play a supported soundfile. See !playlist.'
commands.c_play = function(user, args) {
    commands.c_queue(user, args);
}

commands.h_randplay='Playing a random track from the database.'
commands.c_randplay = function(user, args) {
    spawn_cmd('beet', ['random', '-p'], (error, stdout) => {
        var match = /\/([A-Za-z0-9_-]+)\./.exec(stdout);
        if (match) {
            var new_args = [match[1]].concat(args);
            commands.c_queue(user, new_args);
        }
    });
}

function spawn_cmd(bin, args, callback) {
    var StringDecoder = require('string_decoder').StringDecoder;

    var ps = require('child_process').spawn(bin, args);

    var stdout = new StringDecoder('utf8');
    var stdoutStrings = [];
    var stderr = new StringDecoder('utf8');
    var stderrStrings = [];

    ps.stdout.on('data', (data) => {
        stdoutStrings.push(stdout.write(data));
    });

    ps.stderr.on('data', (data) => {
        stderrStrings.push(stderr.write(data));
    });

    ps.on('close', (code) => {
        var error = code !== 0;

        stderrStrings.push(stderr.end());
        stdoutStrings.push(stdout.end());

        callback(error, stdoutStrings.join(''), stderrStrings.join(''), code);
    });
}

commands.h_info='Show info about the currently playing track.'
commands.c_info = function(user, args) {
    var filename = 'sounds/' + args[0] + '.ogg';

    if (!current && !args[0].match(/[A-Za-z0-9_-]+/)) {
        user.sendMessage('First argument (filename) is malformed!');
        return;
    }

    if (current && !args[0]) {
        filename = current.filename;
    }

    console.log('User', user.name, 'info', filename);

    spawn_cmd('exiftool', [
        '-h', '-title', '-artist', '-user', filename
    ], function(error, stdout) {
        user.sendMessage(stdout);
    });
}

commands.h_tag='Set tags on a track (ex: tag filename artist Some Artist)'
commands.c_tag = function(user, args) {
    if (!args[0] || !args[0].match(/[A-Za-z0-9_-]+/)) {
        user.sendMessage('First argument (filename) is malformed!');
        return;
    }
    var filename = 'sounds/' + args.shift() + '.ogg';

    var allowed_modes = {
        artist: '-a',
        title: '-t'
    };
    var mode = allowed_modes[args.shift()];
    if (!mode) {
        user.sendMessage('Second argument (must be "artist" or "title") is malformed!');
        return;
    }

    var value = args.join(' ');
    if (!value || !value.match(/[()A-Za-z0-9_ '-]+/)) {
        user.sendMessage('Third argument (value) is malformed!');
        return;
    }

    console.log('User', user.name, 'tag', filename, mode, value);

    spawn_cmd('lltag', ['--yes', mode, value, filename], (error, data) => {
        user.sendMessage(data);
        spawn_cmd('beet', ['remove', 'path::.+/'+filename], (error, data) => {
            spawn_cmd('beet', ['import', '-qCA', filename], (error, data) => {
                user.sendMessage('reimported into library');
            });
        });
    });
}

commands.h_resume='Resume the last song that was stopped'
commands.c_resume = function(user, args) {
    if (!bot.isPlaying && last_stopped) {
        console.log('User', user.name, 'resuming playback of', last_stopped.filename, 'at', last_stopped.at);
        playlist.unshift(last_stopped);
        last_stopped = null;
        play_queue();
    }
}

function volume_clamp(val) {
    return 0.1*Math.min(val, 10);
}

function set_volume(val) {
    current_volume = volume_clamp(val);
    if (current) {
        current.volume = current_volume;
    }
    bot.volume = current_volume;
}

commands.h_volume='Set output volume to specified value.'
commands.c_volume = function(user, args) {
    if (args[0])
        set_volume(parseFloat(args[0]));
    else
        user.sendMessage('Current volume: ' + current_volume);
}

commands.h_volumedefault='Set default output volume to specified value.'
commands.c_volumedefault = function(user, args) {
    if (args[0])
        config.default_volume = parseFloat(args[0]);
}

commands.h_queue='Queue a sound to play. See !playlist and !play.'
commands.c_queue = function(user, args) {
    var volume = volume_clamp(config.default_volume);
    var interrupt = false;
    var file_arg = args.shift();
    var filename = __dirname + '/sounds/' + file_arg + '.ogg';
    var stream_url;

    var arg = args.shift();
    while (arg !== undefined) {
        if (arg == 'interrupt') {
            interrupt = true;
        }
        else if (file_arg != 'stream') {
            volume = volume_clamp(parseFloat(arg));
        }
        else {
            stream_url = arg;
        }
        arg = args.shift();
    }

    if (file_arg == 'stream') {
        if (stream_url !== undefined) {
            filename = stream_url;
        } else {
            filename = config.mpd_stream;
        }
    }
    else if (!file_exists(filename)) {
        user.sendMessage("Sound file does not exist!");
        return;
    }
    console.log('User', user.name, 'playing', filename);

    var data = {user: user, volume: volume, filename: filename};
    if (interrupt) {
        if (!bot.isPlaying) {
            return;
        }
        data.interrupt = true;
        if (!current.interrupt) {
            playlist.unshift(current);
        }
        playlist.unshift(data);
        current.at = bot.stopPlaying();
    }
    else {
        playlist.push(data);
        if (!bot.isPlaying) {
            play_queue();
        }
    }
}

function play_queue() {
    var data = playlist.shift();

    if (data) {
        current = data;
        play_soundfile(data.filename, data.volume, data.user, data.at);
    }
    else {
        current = null;
    }
}

commands.h_queueclear='Clear the play queue. See !queue.'
commands.c_queueclear = function(user, args) {
    playlist = [];
        console.log(user.name, 'listing', directory, 'filtering by', filter);
    commands.c_stop(user, args);
}

commands.h_stream='Play the local MPD stream.'
commands.c_stream = function(user, args) {
    console.log('playing MPD stream');
    set_volume(config.default_volume);
    commands.c_queue(user, ['stream'].concat(args));
}

function float_to_int(options) {
    stream.Transform.call(this, options);
}
util.inherits(float_to_int, stream.Transform);

float_to_int.prototype._transform = function (chunk, enc, cb) {
    var b = new buffer.Buffer(chunk.length/4 * 2);
    for (var i=0, j=0; i<chunk.length; i+=4,j+=2) {
        var f = chunk.readFloatLE(i);
        f = f * 32768;
        if (f > 32767) f = 32767;
        if (f < -32768) f = -32768;

        b.writeInt16LE(Math.floor(f), j);
    }
    this.push(b);
    cb();
};

function play_soundfile(file, volume, user, at) {
    if (at === undefined) {
        at = 0;
    }

    if (bot.isPlaying) {
        bot.stopPlaying();
    }

    set_volume(volume);
    var od = new ogg.Decoder();
    var tform = new float_to_int();
    od.on('stream', function(stream) {
        var vd = new vorbis.Decoder();
        vd.on('format', function(format) {
            bot.audioInput = bot.connection.inputStream({
                channels: format.channels,
                sampleRate: format.sampleRate,
                bitDepth: 16, //format.bitDepth,
                signed: format.signed,
                gain: volume
            });
            vd.pipe(tform).pipe(bot.audioInput);
        });
        vd.on('end', function() {
            bot.stopPlaying();
            play_queue();
        });
        vd.on('error', function(e) {
            console.error(e);
            bot.stopPlaying();
        });

        stream.pipe(vd);
    });
    od.on('error', function(e) {
        console.error(e);
        bot.stopPlaying();
    });

    fs.createReadStream(file).pipe(od);
}

commands.h_queuelist='Display play queue. See !queue.'
commands.c_queuelist = function(user, args) {
    var lines = [];
    for (var i=0; i<playlist.length; i++) {
        var match = /\/sounds\/(.+).ogg$/.exec(playlist[i].filename);
        lines.push(match[1]);
    }
    if (current) {
        var match = /\/sounds\/(.+).ogg$/.exec(current.filename);
        user.sendMessage('Currently playing: ' + match[1])
    }

    if (lines.length) {
        user.sendMessage('Queued sounds:<br/>' + lines.join('<br/>'));
    }
    else {
        user.sendMessage('Queue empty!');
    }
}

function file_exists(file) {
    try {
        fs.lstatSync(file);
        return true;
    } catch (e) {
        console.error(e);
    }
    return false;
}

function randint (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

commands.h_playlist='List files available to !play. Args: ls <sort> <name>'
commands.c_playlist = function(user, args) {
    var directory = 'sounds';

    function print_page(num, lines) {
        user.sendMessage('Sound files (' + num + '):<br/>' + lines.join('<br/>'));
    }

    var pages = -1;

    var flags = '-sh1';
    var sort = args[0];

    if (sort == 'rand') {
        args.shift();
        pages = 1;
    }
    if (sort == 'date') {
        args.shift();
        flags = flags + 'rt';
    }
    else if (sort == 'new') {
        args.shift();
        flags = flags + 'Rt';
        pages = 1;
    }

    var filter = args.shift();

    if (filter) {
        console.log(user.name, 'listing', directory, 'filtering by', filter);
    }
    else {
        console.log(user.name, 'listing', directory);
    }

    var num_rand = 10;

    spawn_cmd('/bin/ls', [flags, directory], (error, data) => {
        if (error) return;
        var match_re = /(.+) (.+)/g;
        var match;

        var lines = [];
        var per_page = 50;
        var page = 1;
        var i = 0;
        while ((match = match_re.exec(data)) !== null) {
            i = i + 1;
            if (match[1] != 'total') {
                if (filter && match[2].indexOf(filter) === -1) {
                    continue;
                }
                var name = match[2].split('.').shift();
                var value = '<b>' + name + '</b> - ' + match[1];

                if (sort == 'rand') {
                    var p = randint(1, i);
                    if (lines.length < num_rand) {
                        lines.push(value);
                    }
                    else if (p <= num_rand) {
                        lines[p-1] = value;
                    }
                }
                else {
                    lines.push(value);
                }
            }
            if (lines.length >= per_page) {
                if (sort == 'rand')
                    lines.sort();
                print_page(page, lines);
                lines = [];
                page++;
                if (pages != -1 && page >= pages) {
                    break;
                }
            }
        }
        if (lines.length) {
            if (sort == 'rand')
                lines.sort();
            print_page(page, lines);
        }
    });
}

function message_pre(user, data) {
    var m = config.message_max - '<pre></pre>'.length;

    var splits = [];
    if (data.indexOf('\n') === -1) {
        data = data + '\n';
    }

    for (var start=0; start<data.length; start+=m) {
        var last = data.lastIndexOf('\n', Math.min(start+m, data.length));
        splits.push([start, last]);
        start = last+1;
    }

    for (var i=0; i<splits.length; i++) {
        user.sendMessage('<pre>' + data.substring(splits[i][0], splits[i][1]) + '</pre>');
    }
}

commands.h_ytsave='Download and save a Youtube/Vimeo/etc URL with a name.'
commands.c_ytsave = function(user, args) {
    var hash = args[0];
    var dest = 'sounds/' + args[1] + '.ogg';
    var ss = args[2];
    var t = args[3];

    if (!hash || !hash.match(/^(https?:\/\/[^\s/$.?#].[^\s]*|[A-Za-z0-9_-]+)$/)) {
        user.sendMessage('First argument (URL) is malformed!');
        return;
    }
    if (!args[1] || !args[1].match(/[A-Za-z0-9_-]+/)) {
        user.sendMessage('Second argument (name) is malformed!');
        return;
    }
    if (ss && !ss.match(/\d\d:\d\d:\d\d/)) {
        user.sendMessage('Third argument (start time) is malformed!');
        return;
    }
    if (t && !t.match(/\d\d:\d\d:\d\d/g)) {
        user.sendMessage('Fourth argument (duration) is malformed!');
        return;
    }

    console.log('User', user.name, 'ytsave', hash, dest, ss, t);
    user.sendMessage(`Downloading ${hash} as ${args[1]}`);

    spawn_cmd('/bin/bash', [
            'youtube_dl.sh', hash, dest, ss, t, user.name
    ], (error, stdout, stderr) => {
        console.log(stdout);
        if (error) {
            user.sendMessage(`Could not download: ${stdout} ${stderr}`);
        }
        else {
            user.sendMessage(`Saved new sound to ${args[1]}`);
        }
    });
}

commands.h_mpc='Use MPC to control the local MPD server.'
commands.c_mpc = function(user, args) {
    console.log('User', user.name, 'mpc', args);

    spawn_cmd('/usr/bin/mpc', args, (error, data) => {
        console.log(data);
        message_pre(user, data);
    });

    if (args[2] == 'play') {
        console.log('playing stream');
        commands.c_stream(user, []);
    }
}

connect()
