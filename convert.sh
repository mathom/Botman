#!/bin/bash

input=$1
base=`basename ${input%.*}`
avconv -i $1 -ac 1 -ar 48000 -codec:a libvorbis sounds/$base.ogg
