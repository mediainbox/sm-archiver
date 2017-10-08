var config, nconf;

nconf = require('nconf');

nconf.env().argv();

if (config = nconf.get('config') || nconf.get('CONFIG')) {
  nconf.file({
    file: config
  });
}

module.exports = nconf.get();

//# sourceMappingURL=config.js.map
