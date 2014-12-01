#!/bin/bash

input="$1"
base=`basename ${input%.*}`
avconv -i "$input" -ac 1 -ar 48000 -codec:a libvorbis $2 sounds/$base.ogg
