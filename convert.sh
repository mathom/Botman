#!/bin/bash

input="$1"
base=`basename ${input%.*}`
avconv -i "$input" -ac 1 -ar 44100 -codec:a libvorbis $2 sounds/$base.ogg
normalize-ogg sounds/$base.ogg
