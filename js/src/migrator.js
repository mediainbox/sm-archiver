var Migrator, config, debug, migrator, nconf;

nconf = require('nconf');

debug = require('debug')('sm:migrator');

config = require('./config');

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

migrator = new Migrator(config);

migrator.initialize();

process.on('uncaughtException', function(error) {
  debug(error);
  if (("" + error) === 'Error: got binary data when not reconstructing a packet') {
    return;
  }
  return process.exit(1);
});

//# sourceMappingURL=migrator.js.map
