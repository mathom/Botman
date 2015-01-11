#!/bin/bash

RET=1
AUDIO_OUT=$(mktemp)
youtube-dl --socket-timeout 5 --extract-audio --audio-format m4a -o "$AUDIO_OUT.%(ext)s" $1
if [ $? -eq 0 ]; then
    #mv "$AUDIO_OUT.m4a" "$DIR/sounds/$2.ogg" # not an ogg, i know
    COMMAND="avconv -y -i $AUDIO_OUT.m4a -ac 1 -ar 48000 -codec:a libvorbis"

    if [ -z "$3" ]; then
        COMMAND="$COMMAND -ss $3"
    fi

    if [ -z "$4" ]; then
        COMMAND="$COMMAND -t $4"
    fi
    echo $COMMAND
    COMMAND="$COMMAND $2"

    eval $COMMAND
    RET=$?
fi

rm $AUDIO_OUT*
exit $RET
