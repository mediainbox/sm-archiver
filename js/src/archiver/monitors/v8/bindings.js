var bindings;

bindings = require('bindings');

module.exports = function(dirname, binding) {
  return bindings({
    module_root: dirname,
    bindings: binding
  });
};

//# sourceMappingURL=bindings.js.map
