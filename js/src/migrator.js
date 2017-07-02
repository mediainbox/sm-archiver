var Migrator, config, debug, migrator, nconf;

nconf = require('nconf');

debug = require('debug')('sm:migrator');

Migrator = (function() {
  function Migrator(config1) {
    this.config = config1;
    debug('Created');
  }

  Migrator.prototype.initialize = function() {
    return this.createMigrator().initialize()["catch"](function(error) {
      return debug(error);
    });
  };

  Migrator.prototype.createMigrator = function() {
    return new (this.getMigrator())(this.config.migration.options);
  };

  Migrator.prototype.getMigrator = function() {
    this.migrator = this.migrator || require("./migrators/" + this.config.migration.from + "-" + this.config.migration.to);
    return this.migrator;
  };

  return Migrator;

})();

nconf.env().argv();

if (config = nconf.get('config') || nconf.get('CONFIG')) {
  nconf.file({
    file: config
  });
}

migrator = new Migrator(nconf.get());

migrator.initialize();

process.on('uncaughtException', function(error) {
  debug(error);
  if (("" + error) === 'Error: got binary data when not reconstructing a packet') {
    return;
  }
  return process.exit(1);
});

//# sourceMappingURL=migrator.js.map
