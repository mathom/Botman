responses = {}

responses['^ping[?]$'] = function(message, commands)
    message.user:send('pong!')
end

return responses
