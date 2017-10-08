nconf = require 'nconf'

# Setup nconf to use (in-order):
#   1. Environment variables
#   2. Command-line arguments
#   3. A file located at env param 'config' if found

nconf.env().argv()

if config = nconf.get('config') or nconf.get('CONFIG')
    nconf.file file: config

module.exports = nconf.get()
