#!/bin/bash -e
j2 /config/archiver.json.j2 > /config/archiver.json
sleep 30
exec "$@"
