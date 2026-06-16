const fs = require('node:fs');
const path = require('node:path');
const {
    IOSConfig,
    withDangerousMod,
    withEntitlementsPlist,
    withInfoPlist,
} = require('@expo/config-plugins');

function withIosPersonalSigning(config, options = {}) {
    if (!options.enabled) {
        return config;
    }

    config = withEntitlementsPlist(config, (entitlementsConfig) => {
        delete entitlementsConfig.modResults['aps-environment'];
        delete entitlementsConfig.modResults['com.apple.developer.associated-domains'];
        return entitlementsConfig;
    });

    config = withInfoPlist(config, (infoPlistConfig) => {
        const modes = Array.isArray(infoPlistConfig.modResults.UIBackgroundModes)
            ? infoPlistConfig.modResults.UIBackgroundModes.filter((mode) => mode !== 'remote-notification')
            : [];

        if (modes.length > 0) {
            infoPlistConfig.modResults.UIBackgroundModes = modes;
        } else {
            delete infoPlistConfig.modResults.UIBackgroundModes;
        }

        return infoPlistConfig;
    });

    config = withDangerousMod(config, [
        'ios',
        async (dangerousConfig) => {
            const projectRoot = dangerousConfig.modRequest.projectRoot;
            const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
            const entitlementsPath = path.join(
                projectRoot,
                'ios',
                projectName,
                `${projectName}.entitlements`
            );

            if (!fs.existsSync(entitlementsPath)) {
                return dangerousConfig;
            }

            let contents = fs.readFileSync(entitlementsPath, 'utf8');
            contents = contents.replace(/\s*<key>aps-environment<\/key>\s*<string>[^<]+<\/string>\s*/g, '\n');
            contents = contents.replace(/\s*<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>[\s\S]*?<\/array>\s*/g, '\n');
            fs.writeFileSync(entitlementsPath, contents);

            return dangerousConfig;
        },
    ]);

    return config;
}

module.exports = withIosPersonalSigning;
