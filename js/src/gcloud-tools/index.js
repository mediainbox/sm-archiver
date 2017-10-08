var config, configureStack, keyFilename, projectId;

config = require('../config');

configureStack = function(projectId, keyFilename) {
  require('@google-cloud/trace-agent').start({
    projectId: projectId,
    keyFilename: keyFilename
  });
  return require('@google-cloud/debug-agent').start({
    projectId: projectId,
    keyFilename: keyFilename
  });
};

projectId = config.GCLOUD_PROJECT || config.gCloudProjectId;

if (projectId) {
  keyFilename = config.GOOGLE_APPLICATION_CREDENTIALS || config.gCloudKeyFilename;
  configureStack(projectId, keyFilename);
}

//# sourceMappingURL=index.js.map
