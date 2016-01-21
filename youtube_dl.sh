#!/bin/bash

RET=1
AUDIO_OUT=$(mktemp)

extension="${1##*.}"

if [[ "mp3 ogg m4a" =~ "$extension" ]]; then
    curl $1 > $AUDIO_OUT.$extension
    DL_TITLE=$(basename $1)
else
    extension="ogg"
    echo youtube-dl --socket-timeout 5 --extract-audio --audio-format vorbis -o "$AUDIO_OUT.%(ext)s" -- $1
    youtube-dl --socket-timeout 5 --extract-audio --audio-format vorbis -o "$AUDIO_OUT.%(ext)s" -- $1
    DL_TITLE=$(youtube-dl --socket-timeout 5 --get-title $1)
fi
if [ $? -eq 0 ]; then
    NAME=$AUDIO_OUT.$extension
    if [ -f $AUDIO_OUT.ogg ]; then
        NAME=$AUDIO_OUT.ogg
    fi
    COMMAND="avconv -y -i $NAME -ac 1 -ar 48000 -codec:a libvorbis"

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
    FILENAME=$(readlink -f $2)
    if hash beet 2>/dev/null; then
        beet remove path:$FILENAME
        if hash lltag 2>/dev/null; then
            # for some reason beet won't write custom tags out
            lltag -q --yes --tag user="$5" $FILENAME
            echo "set user to $5"
        fi
        beet import -Csq $FILENAME
        if [ -z "$(beet ls path:$FILENAME)" ]; then
            echo "reimporting with title $DL_TITLE"
            beet import -ACq $FILENAME # in case it doesnt have real tags...
            beet modify -My path:$FILENAME title="$DL_TITLE"
        fi
    fi
    RET=$?
fi

rm $AUDIO_OUT*
exit $RET
