Botman
=======

Formerly a [piepan](https://github.com/mathom/piepan) script to provide useful and fun features for your Mumble server.

Becuase piepan has pulled JS support I've forked the project at the last compatible version. I'll be porting to [node-mumble](https://github.com/Rantanen/node-mumble) soon.

Installation
------------

Build a copy of [piepan](https://github.com/layeh/piepan) for yourself.
Install the required command line tools:

```sudo apt-get install youtube-dl libav-tools normalize-audio```

Usage
-----

Run like you would any other piepan bot:

```piepan -ffmpeg=avconv -username Botman -insecure=true -certificate botman.pem js:args.js js:bot.js```

Note that you can specify `--channel` to make the bot join a specific channel.

Type `!help` in the chat for a list of commands. You can whisper them to the bot as well,
but be sure to send regular text and not HTML.

