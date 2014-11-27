responses = {}

responses['dotabuff.com/matches/'] = function(message, commands)
    local username = message.user.name
    local url = message.text:match('dotabuff.com/matches/(%d+)')
    local users = '\'{"diego":34141594,"jesse":18507937,"matt":9864723,"paul":57882424,"dave":57220923,"mario":22623709,"mason":32169219,"myles":53636354,"jesus":37337059}\''
    local command = 'python dotabuff.py ' .. url .. ' ' .. users
    print('User ' .. username .. ' is running ' .. command)
    local comment = io.popen(command)
    local answer = comment:read('*all')

    commands.c_say(message.user, {answer})
end

return responses
