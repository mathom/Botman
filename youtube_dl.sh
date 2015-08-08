#!/bin/bash

RET=1
AUDIO_OUT=$(mktemp)

extension="${1##*.}"

if [[ "mp3 ogg m4a" =~ "$extension" ]]; then
    curl $1 > $AUDIO_OUT.$extension
else
    extension="m4a"
    youtube-dl --socket-timeout 5 --extract-audio --audio-format m4a -o "$AUDIO_OUT.%(ext)s" -- $1
fi
if [ $? -eq 0 ]; then
    NAME=$AUDIO_OUT.$extension
    if [ -f $AUDIO_OUT.ogg ]; then
        NAME=$AUDIO_OUT.ogg
    fi
    COMMAND="avconv -y -i $NAME -ac 1 -ar 44100 -codec:a libvorbis"

    if [ "$3" != "undefined" ]; then
        COMMAND="$COMMAND -ss $3"
    fi

    if [ "$4" != "undefined" ]; then
        COMMAND="$COMMAND -t $4"
    fi
    echo $COMMAND
    COMMAND="$COMMAND $2"

    eval $COMMAND
    normalize-ogg $2
    RET=$?
fi

rm $AUDIO_OUT*
exit $RET
