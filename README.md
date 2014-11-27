CoolDudesBot
============

A [piepan](https://github.com/layeh/piepan) script to provide useful and fun features for your Mumble server.

Installation
------------

Build a copy of [piepan](https://github.com/layeh/piepan) for yourself.
Install the required command line tools:

```sudo apt-get install fortune espeak youtube-dl libav-tools```

You can also compile [SAM](https://github.com/s-macke/SAM) if you like.

Sounds for the soundboard function can be imported with the included `convert.sh` script.

Usage
-----

Run like you would any other piepan bot:

```piepan -u Botman -c botman.pem -d bot.lua --channel="Cool Dudes Only"```

Note that you can specify `--channel` to make the bot join a specific channel.

Type `!help` in the chat for a list of commands. You can whisper them to the bot as well,
but be sure to send regular text and not HTML.
