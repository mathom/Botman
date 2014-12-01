commands = {}
responses = {}
playlist = {}
current = nil

shortcuts = {
  s = 'stop',
  ql = 'queuelist',
  qc = 'queueclear',
  h = 'help'
}

function join_channel()
    if piepan.args['channel'] ~= nil then
        print('Joining channel ' .. piepan.args['channel'][1])
        local home_channel = piepan.channels(piepan.args['channel'])
        piepan.me:moveTo(home_dudes)
    end
end

function load_responses()
    if piepan.args.responses ~= nil then
        for _,file in ipairs(piepan.args.responses) do
            print('Loading ' .. file)
            local loaded, err = loadfile(file)
            if not loaded then
                error('Cannot load ' .. file .. ' : ' .. err)
            else
                local new = loaded()
                local count = 0
                for key,val in pairs(new) do
                    responses[key] = val
                    count = count + 1
                end
            end
        end
    end
end

has_seen_user = {}

function piepan.onUserChange(event)
    local my_channel = piepan.me.channel.id
    if event.isChangedChannel and event.user.channel.id == my_channel then
        if not has_seen_user[event.user.userId] then
            commands.c_say(event.user, {'hello, ' .. event.user.name .. '!'})
            has_seen_user[event.user.userId] = true
        end
    end
end

function piepan.onConnect()
    load_responses()
    join_channel()
end

function piepan.onMessage(msg)
    if msg.user == nil then
        return
    end

    for response, func in pairs(responses) do
        if msg.text:match(response) then
            func(msg, commands)
        end
    end

    local mode, command, rest = msg.text:match('^([+!@])(%w+) ?(.*)$')
    if mode == '@' then
        rest = command .. ' ' .. rest
        command = 'play'
    end
    if mode == '+' then
        rest = command .. ' ' .. rest
        command = 'queue'
    end
    if command == nil then
        return
    end

    local args = {}
    for word in rest:gmatch("[%w%p]+") do table.insert(args, word) end

    if shortcuts[command] then
        command = shortcuts[command]
    end

    if commands['c_' .. command] then
        -- join_channel()
        commands['c_' .. command](msg.user, args)
    end
end

commands.h_help='Print this help message.'
function commands.c_help(user, args)
    local names = {}
    for name, _ in pairs(commands) do
        if name:sub(0,2) == 'c_' then
            local base = name:match('c_(.+)')
            local help = commands['h_' .. base]
            table.insert(names, '<b>!' .. base .. '</b> ' .. help)
        end
    end

    table.sort(names)
    user:send('Available commands:<br/>' .. table.concat(names, '<br/>'))
end

commands.h_stop='Stop playing sound.'
function commands.c_stop(user, args)
    piepan.Audio:stop()
end

commands.h_echo='Repeat what you just said.'
function commands.c_echo(user, args)
    user:send(table.concat(args, ' '))
end

commands.h_queue='Queue a sound to play. See !playlist and !play.'
function commands.c_queue(user, args)

    local volume = 0.5

    if args[2] ~= nil then
        volume = tonumber(args[2])
    end

    local filename = 'sounds/' .. args[1] .. '.ogg'

    table.insert(playlist, 1, {user=user, volume=volume, filename=filename})

    if not piepan.Audio:isPlaying() then
        play_queue()
    end
end

commands.h_queuelist='Display play queue. See !queue.'
function commands.c_queuelist(user, args)
    local lines = {}
    for _,data in ipairs(playlist) do
        table.insert(lines, data.filename:match('^sounds/(.+).ogg$'))
    end
    if current then
        user:send('Currently playing: ' .. current)
    end

    if #lines > 0 then
        user:send('Queued sounds:<br/>' .. table.concat(lines, '<br/>'))
    else
        user:send('Queue empty!')
    end
end

commands.h_queueclear='Clear the play queue. See !queue.'
function commands.c_queueclear(user, args)
    playlist = {}
    commands.c_stop(user, args)
end

commands.h_play='Play a supported soundfile. See !playlist.'
function commands.c_play(user, args)
    playlist = {}
    commands.c_stop(user, args)
    commands.c_queue(user, args)
end

function play_queue()
    local data = table.remove(playlist)
    if data then
        play_soundfile(data.filename, data.volume, data.user)
    end
end

function play_soundfile(file, volume, user)
    if piepan.Audio:isPlaying() then
        piepan.Audio:stop()
    end

    local success = piepan.me.channel:play({filename=file, volume=volume}, play_queue)

    if not success then
        user:send("I couldn't play that sound, sorry.")
    else
        current = file:match('^sounds/(.+).ogg$')
    end
end

commands.h_say='Speak your message aloud.'
function commands.c_say(user, args)
    local cargs = ''
    local mode = 'espeak'
    local pitch_flag = ' -p '
    local speed_flag = ' -s '

    if args[1] == 'c64' then
        mode = 'sam'
        pitch_flag = ' -pitch '
        speed_flag = ' -speed '
        table.remove(args, 1)
    end

    local sargs = args[1]
    local pitch = sargs:match('p(%d+)')
    if pitch ~= nil then
        cargs = cargs .. pitch_flag .. pitch
    end
    local speed = sargs:match('s(%d+)')
    if speed ~= nil then
        cargs = cargs .. speed_flag .. speed
    end
    local variant = sargs:match('v\'(.+)\'')
    if variant ~= nil then
        cargs = cargs .. ' -v ' .. variant
    end
    local throat = sargs:match('t(%d+)')
    if variant ~= nil then
        cargs = cargs .. ' -throat ' .. throat
    end
    local mouth = sargs:match('m(%d+)')
    if variant ~= nil then
        cargs = cargs .. ' -mouth ' .. mouth
    end

    if cargs ~= '' then
        table.remove(args, 1)
    end

    local input = '/tmp/say.wav'
    os.remove(input)
    local message = table.concat(args, ' '):gsub('[^a-zA-Z0-9,\'-\\!. ]','\\%1')
    print('User ' .. user.name .. ' is saying ' .. message)
    if mode == 'espeak' then
        command = 'espeak ' .. cargs .. ' -w ' .. input .. ' "' .. message .. '"'
    elseif mode == 'sam' then
        command = 'sam ' .. cargs .. ' -wav ' .. input .. ' "' .. message .. '"'
    end
    rval, rtype = os.execute(command)

    if rtype ~= 'exit' or not rval then
        user:send('Error speaking!')
        return
    end

    local out = '/tmp/say.ogg'
    os.remove(out)
    command = 'avconv -i ' .. input .. ' -ac 1 -ar 48000 -codec:a libvorbis ' .. out
    rval, rtype = os.execute(command)

    if rtype ~= 'exit' or not rval then
        user:send('Error converting audio!')
        return
    end

    play_soundfile(out, 1.0, user)
end

commands.h_8ball='Ask the magic 8 Ball a question.'
function commands.c_8ball(user, args)
    local responses = {"As I see it, yes","It is certain","It is decidedly so","Most likely","Outlook good","Signs point to yes","Without a doubt","Yes","Yes definitely","You may rely on it","Reply hazy, try again","Ask again later","Better not tell you now","Cannot predict now","Concentrate and ask again","Don't count on it","My reply is no","My sources say no","Outlook not so good","Very doubtful"}
    local answer = responses[math.random(#responses)]

    commands.c_say(user, {answer})
    user.channel:send(answer)
end

commands.h_fortune='Read your fortune for the day.'
function commands.c_fortune(user, args)
    local fortune = io.popen('fortune')
    local answer = fortune:read('*all')

    commands.c_say(user, {answer})
    user.channel:send(answer)
end

commands.h_playlist='List files available to !play.'
function commands.c_playlist(user, args)
    local ls = io.popen('ls -sh1 sounds')

    local files = {}
    local file = ls:read()
    while file ~= nil do
        local size, name = file:match('([^.]+) ([^.]+)')
        if name ~= 'total' then
            table.insert(files, '<b>' .. name .. '</b> - ' .. size)
        end
        file = ls:read()
    end

    local lines = {}
    local pages = 1
    for _,line in ipairs(files) do
        table.insert(lines, line)
        if #lines >= 50 then
            user:send('Sound files (' .. pages .. '):<br/>' .. table.concat(lines, '<br/>'))
            lines = {}
            pages = pages + 1
        end
    end

    if #lines > 0 then
        user:send('Sound files (' .. pages .. '):<br/>' .. table.concat(lines, '<br/>'))
    end
end

commands.h_ytplay='Download and play the audio from Youtube (supply video ID only).'
function commands.c_ytplay(user, args)
    local volume = 1.0

    if args[2] ~= nil then
        volume = tonumber(args[2])
    end

    function finish(output)
        if output == nil then
            return
        end

        play_soundfile(output, volume, user)
        os.remove(output)
    end

    user:send('Downloading and playing ' .. args[1])
    piepan.Thread.new(download_youtube, finish, {hash=args[1], user=user, ss=args[3], t=args[4]})
end

function file_exists(name)
    local f=io.open(name,"r")
    if f~=nil then io.close(f) return true else return false end
end

function download_youtube(data)
    local hash = data.hash:match('^([%d%a_-]+)$')
    local user = data.user
    local ss = nil
    if data.ss then
        ss = data.ss:match('^(%d%d:%d%d:%d%d)$')
    end
    local t = nil
    if data.t then
        t = data.t:match('^(%d%d:%d%d:%d%d)$')
    end

    print('User ' .. user.name .. ' is downloading ' .. hash)
    local tmp = os.tmpname()
    local yt = tmp
    os.remove(tmp)
    local command = 'youtube-dl --socket-timeout 10 -x https://www.youtube.com/watch?v=' .. hash .. ' -o "' .. yt .. '.%(ext)s"'
    print('User ' .. user.name .. ' running: ' .. command)
    local rval, rtype = os.execute(command)

    if file_exists(yt .. '.ogg') then
        yt = yt .. '.ogg'
    else
        yt = yt .. '.m4a'
    end

    if rtype ~= 'exit' or not rval then
        user:send('Error downloading ' .. hash .. '!')
        os.remove(yt)
        return
    end
    print('User ' .. user.name .. ' is converting ' .. yt)

    local tmp = os.tmpname()
    local out = tmp .. '.ogg'
    os.remove(tmp)

    local extra = ''
    if ss then
        extra = extra .. ' -ss ' .. ss
    end

    if t then
        extra = extra .. ' -t ' .. t
    end

    command = 'avconv -i ' .. yt .. ' -ac 1 -ar 48000 -codec:a libvorbis ' .. extra .. ' ' .. out
    print('User ' .. user.name .. ' running: ' .. command)
    rval, rtype = os.execute(command)
    os.remove(yt)

    if rtype ~= 'exit' or not rval then
        user:send('Error converting audio!')
        os.remove(out)
        return
    end

    print('User ' .. user.name .. ' is normalizing ' .. out)
    command = 'normalize-ogg ' .. out
    print('User ' .. user.name .. ' running: ' .. command)
    rval, rtype = os.execute(command)

    if rtype ~= 'exit' or not rval then
        user:send('Error normalizing audio!')
        os.remove(out)
        return
    end

    return out
end

commands.h_ytsave='Download and save a Youtube (video ID) with a name.'
function commands.c_ytsave(user, args)
    user:send('Downloading ' .. args[1] .. ' as ' .. args[2])
    function finish(output)
        if output == nil then
            return
        end

        local name = args[2]:match('(%w+)')

        os.rename(output, 'sounds/' .. name .. '.ogg')
        user:send('Saved new sound to ' .. name)
    end
    piepan.Thread.new(download_youtube, finish, {hash=args[1], user=user, ss=args[3], t=args[4]})
    -- finish(download_youtube({hash=args[1], user=user, ss=args[3], t=args[4]}))
end
