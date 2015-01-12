#!/bin/bash

avconv -f s32le -i /tmp/mpd.fifo -ac 1 -ar 44100 -codec:a libvorbis -f ogg pipe: > mpd.ogg
