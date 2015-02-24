var commands = {};
var responses = {};
var playlist = [];
var themes = {};
var current = null;
var current_volume;

var default_config = {
    default_volume: 0.25,
    message_max: 5000,
    mpd_stream: 'http://localhost:6601'
};

var shortcuts = {
    s: 'stop',
    ql: 'queuelist',
    qc: 'queueclear',
    h: 'help',
    pl: 'playlist',
    ls: 'playlist',
    v: 'volume',
    vd: 'volumedefault',
    m: 'mpc'
};

piepan.On('connect', function(e) {
    if (!config) {
        config = {};
    }

    if (config.channel) {
        console.log('Joining channel ' + config.channel);
        piepan.Self.Move(piepan.Channels[config.channel]);
    }

    for (var key in default_config) {
        if (!config[key]) {
            config[key] = default_config[key];
        }
    }
});

piepan.On('message', function(e) {
    if (e.Sender == null) {
        //console.log('ignoring message from null sender');
        return;
    }

    var msg = e.Message.replace(/&quot;/g, '"');
    var command_re = /^([+!@])(\w+)?(.*)$/;
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
        case '+':
            rest = command + ' ' + rest;
            command = 'queue';
            break;
    }

    if (!command) {
        return;
    }

    var args = rest.match(/"[^"]*"|[^\s"]+/g);
    if (args !== undefined) {
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
        commands['c_' + command](e.Sender, args);
    }
});

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
    user.Send('Available commands:<br/>' + result.join('<br/>'));
}

commands.h_stop='Stop playing sound.'
commands.c_stop = function(user, args) {
    if (user.UserID() != 14 && user.UserID() != 46) {
        piepan.Audio.Stop()
    }
}

commands.h_play='Play a supported soundfile. See !playlist.'
commands.c_play = function(user, args) {
    commands.c_queue(user, args, true);
}

function set_volume(val) {
    current_volume = Math.min(val, 1);
    piepan.Audio.SetVolume(current_volume);
}

commands.h_volume='Set output volume to specified value.'
commands.c_volume = function(user, args) {
    if (args[0])
        set_volume(parseFloat(args[0]));
    else
        user.Send('Current volume: ' + current_volume);
}

commands.h_volumedefault='Set default output volume to specified value.'
commands.c_volumedefault = function(user, args) {
    if (args[0])
        config.default_volume = Math.min(parseFloat(args[0]), 1);
}

commands.h_queue='Queue a sound to play. See !playlist and !play.'
commands.c_queue = function(user, args, interrupt) {
    var volume = config.default_volume;

    if (args[1]) {
        volume = parseFloat(args[1]);
    }

    var filename = 'sounds/' + args[0] + '.ogg';

    if (!file_exists(filename)) {
        user.Send("Sound file does not exist!");
        return;
    }
    console.log('User ' + user.Name() + ' playing ' + filename);

    playlist.push({user: user, volume: volume, filename: filename});

    if (!piepan.Audio.IsPlaying()) {
        play_queue()
    }
}

function play_queue() {
    var data = playlist.shift();
    if (data) {
        current = data;
        play_soundfile(data.filename, data.volume, data.user);
    }
    else {
        current = null;
    }
}

commands.h_queueclear='Clear the play queue. See !queue.'
commands.c_queueclear = function(user, args) {
    playlist = [];
    commands.c_stop(user, args);
}

commands.h_stream='Play the local MPD stream.'
commands.c_stream = function(user, args) {
    piepan.Audio.Stop();
    console.log('playing MPD stream');
    set_volume(config.default_volume);
    piepan.Audio.Play({filename: config.mpd_stream});
}

function play_soundfile(file, volume, user) {
    if (!file_exists(file)) {
        user.Send("Sound file does not exist!");
        return;
    }

    if (piepan.Audio.IsPlaying()) {
        piepan.Audio.Stop();
    }

    set_volume(volume);
    piepan.Audio.Play({filename: file, callback: play_queue});
}

commands.h_queuelist='Display play queue. See !queue.'
commands.c_queuelist = function(user, args) {
    var lines = [];
    for (var i=0; i<playlist.length; i++) {
        var match = /^sounds\/(.+).ogg$/.exec(playlist[i].filename);
        lines.push(match[1]);
    }
    if (current) {
        var match = /^sounds\/(.+).ogg$/.exec(current.filename);
        user.Send('Currently playing: ' + match[1])
    }

    if (lines.length) {
        user.Send('Queued sounds:<br/>' + lines.join('<br/>'));
    }
    else {
        user.Send('Queue empty!');
    }
}

function file_exists(file) {
    return true;
}

commands.h_playlist='List files available to !play. Args: ls <sort> <name>'
commands.c_playlist = function(user, args) {
    var directory = 'sounds';

    function print_page(num, lines) {
        user.Send('Sound files (' + num + '):<br/>' + lines.join('<br/>'));
    }

    var pages = -1;

    var flags = '-sh1';
    var sort = args[0];

    if (sort == 'date') {
        args.shift();
        flags = flags + 'rt';
    }
    else if (sort == 'new') {
        args.shift();
        flags = flags + 'Rt';
        pages = 1;
    }
    console.log(flags);


    var filter = args.shift();

    if (filter) {
        console.log(user.Name(), 'listing', directory, 'filtering by', filter);
    }
    else {
        console.log(user.Name(), 'listing', directory);
    }

    piepan.Process.New(function (success, data) {
        if (!success) return;
        var match_re = /(.+) (.+)/g;
        var match;

        var lines = [];
        var per_page = 50;
        var page = 1;
        while ((match = match_re.exec(data)) !== null) {
            if (match[1] != 'total') {
                if (filter && match[2].indexOf(filter) === -1) {
                    continue;
                }
                var name = match[2].split('.').shift();
                lines.push('<b>' + name + '</b> - ' + match[1]);
            }
            if (lines.length >= per_page) {
                print_page(page, lines);
                lines = [];
                page++;
                if (pages != -1 && page >= pages) {
                    break;
                }
            }
        }
        if (lines.length) {
            print_page(page, lines);
        }
    }, '/bin/ls', flags, directory);
}
/*
commands.h_say='Speak your message aloud.'
commands.c_say = function(user, args) {
    var cargs = '';
    var mode = 'pico';
    var pitch_flag = ' -p ';
    var speed_flag = ' -s ';

    if (user.UserID() == 14 || user.UserID() == 46) {
        return;
    }

    if (args[0] == 'c64') {
        mode = 'sam'
        pitch_flag = ' -pitch '
        speed_flag = ' -speed '
        args.shift();
    }
    if (args[0] == 'espeak') {
        mode = 'espeak';
        args.shift();
    }

    var sargs = args[0];

    var matches = {
        /p(%d+)/: pitch_flag,
        /s(%d+)/: speed_flag,
        /v'(.+)'/: ' -v ',
        /t(%d+)/: ' -throat ',
        /m(%d+)/: ' -mouth '
    };

    for (var re in matches) {
        var match = re.exec(sargs);
        if (match) {
            cargs = cargs + matches[re] + match[1];
        }
    }

    if (cargs) args.shift();

    var input = '/tmp/say.wav';
    // var message = table.concat(args, ' '):gsub("[^a-zA-Z0-9,\'-\\!. #:]","\\%1");
    console.log('User', user.Name(), 'is saying', message);
    switch (mode) {
        case 'espeak':
            command = 'espeak ' + cargs + ' -w ' + input + ' "' + message + '"';
            break;
        case 'sam':
            command = 'sam ' + cargs + ' -wav ' + input + ' "' + message + '"';
            break;
        case 'pico':
            command = 'pico2wave ' + ' -w ' + input + ' "' + message + '"';
            break;
    }
    console.log('User', user.Name(), 'is running:', command);


    rval, rtype = os.execute(command)

    if rtype ~= 'exit' or not rval then
        user:send('Error speaking!')
        return
    end

    local out = '/tmp/say.ogg'
    os.remove(out)
    command = 'avconv -i ' .. input .. ' -ac 1 -ar 44100 -codec:a libvorbis ' .. out
    rval, rtype = os.execute(command)

    if rtype ~= 'exit' or not rval then
        user:send('Error converting audio! ' .. rval .. ' ' .. rtype)
        return
    end

    play_soundfile(out, 1.0, user)
    }
*/

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
        user.Send('<pre>' + data.substring(splits[i][0], splits[i][1]) + '</pre>');
    }
}

commands.h_ytsave='Download and save a Youtube (video ID) with a name.'
commands.c_ytsave = function(user, args) {
    var hash = args[0];
    var dest = 'sounds/' + args[1] + '.ogg';
    var ss = args[2];
    var t = args[3];

    if (!hash || !hash.match(/[A-Za-z0-9_-]+/)) {
        user.Send('First argument (hash) is malformed!');
        return;
    }
    if (!args[1] || !args[1].match(/[A-Za-z0-9_-]+/)) {
        user.Send('Second argument (name) is malformed!');
        return;
    }
    if (ss && !ss.match(/\d\d:\d\d:\d\d/)) {
        user.Send('Second argument (start time) is malformed!');
        return;
    }
    if (t && !t.match(/\d\d:\d\d:\d\d/g)) {
        user.Send('Second argument (duration) is malformed!');
        return;
    }

    console.log('User', user.Name(), 'ytsave', hash, dest, ss, t);
    user.Send('Downloading ' + hash + ' as ' + args[1]);

    piepan.Process.New(function (success, data) {
        console.log(data);
        if (!success) {
            user.Send('Could not download: ' + data);
        }
        else {
            user.Send('Saved new sound to ' + args[1]);
        }
    }, '/bin/bash', 'youtube_dl.sh', hash, dest, ss, t);
}

commands.h_mpc='Use MPC to control the local MPD server.'
commands.c_mpc = function(user, args) {
    console.log('User', user.Name(), 'mpc', args);

    var callback = function (success, data) {
        console.log(data);
        //user.Send('<pre>' + data + '</pre>');
        message_pre(user, data);
    };
    args.unshift('/usr/bin/mpc');
    args.unshift(callback);
    piepan.Process.New.apply(null, args);

    if (args[2] == 'play') {
        console.log('playing stream');
        commands.c_stream(user, []);
    }
}

