config = require '../config'

configureStack = (projectId, keyFilename) ->
    require('@google-cloud/trace-agent').start({
        projectId: projectId,
        keyFilename: keyFilename
    })

    require('@google-cloud/debug-agent').start({
        projectId: projectId,
        keyFilename: keyFilename
    })

projectId = config.GCLOUD_PROJECT or config.gCloudProjectId
if projectId
    keyFilename = config.GOOGLE_APPLICATION_CREDENTIALS or config.gCloudKeyFilename
    configureStack(projectId, keyFilename)
