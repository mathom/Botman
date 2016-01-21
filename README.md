Botman
=======

A simple bot to provide administration or multimedia on Mumble servers.

Requirements
------------

 * nodeenv (install with pip)
 * exiftool (from libimage-exiftool-perl)
 * normalize-ogg (from normalize-audio)
 * avconv (ffmpeg)
 * [youtube-dl](https://rg3.github.io/youtube-dl)
 * [beets](https://github.com/beetbox/beets)

You can install all of these with the following on Ubuntu:
```
sudo apt-get install youtube-dl libav-tools normalize-audio beets libimage-exiftool-perl python-pip
```

You'll also want to install nodeenv if you don't have it:
```
sudo pip install nodeenv
```

Installation
------------

Set up a nodeenv for 4.2.4 and activate it:
```
nodeenv --node=4.2.4 --prebuilt botmanenv
source ./env/bin/activate
```

Install the node modules for Botman:
```
npm install
```

Take a peek in `config_example.js` and set up a config file for yourself.

Config options can also be specified on the command line. Run `./bot.js --help` to see some.

Updating
--------

You can just `git pull` and re-run the `npm install` to get the latest code.

Usage
-----

Simply run the bot script and any other extensions or configs you want:
```
./bot.js --server 127.0.0.1 --name MyBot --command "@helloworld" --channel "my channel" my_config.js my_extensions.js
```

Type `!help` in the chat for a list of commands. You can whisper them to the bot as well,
but be sure to send regular text and not HTML.

