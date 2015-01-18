var commands = {};
var responses = {};
var playlist = [];
var themes = {};
var current = null;

var default_config = {
    default_volume: 0.25,
    mpd_stream: 'http://localhost:6601'
};

var shortcuts = {
    s: 'stop',
    ql: 'queuelist',
    qc: 'queueclear',
    h: 'help',
    pl: 'playlist',
    ls: 'playlist',
    v: 'volume'
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

    var command_re = /^([+!@])(\w+) ?([\w-_.: ]*)$/;
    var match = command_re.exec(e.Message);
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

    var args = rest.split(/\s+/);

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

commands.h_volume='Set output volume to specified value.'
commands.c_volume = function(user, args) {
    piepan.Audio.SetVolume(parseFloat(args[0]));
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
    piepan.Audio.SetBitrate(44100);
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

    piepan.Audio.SetVolume(volume);
    piepan.Audio.SetBitrate(44100);
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

commands.h_playlist='List files available to !play.'
commands.c_playlist = function(user, args) {
    var directory = 'sounds';
    if (args[0]) {
        directory = directory + ' | grep '  + args[0];
    }
    console.log(user.Name(), 'listing', directory);

    function print_page(num, lines) {
        user.Send('Sound files (' + num + '):<br/>' + lines.join('<br/>'));
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
                var name = match[2].split('.').shift();
                lines.push('<b>' + name + '</b> - ' + match[1]);
            }
            if (lines.length >= per_page) {
                print_page(page, lines);
                lines = [];
                page++;
            }
        }
        if (lines.length) {
            print_page(page, lines);
        }
    }, '/bin/bash', '-c', 'ls -sh1 ' + directory);
}

commands.h_ytsave='Download and save a Youtube (video ID) with a name.'
commands.c_ytsave = function(user, args) {
    var hash = args[0];
    var dest = 'sounds/' + args[1] + '.ogg';
    var ss = args[2];
    var t = args[3];

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

