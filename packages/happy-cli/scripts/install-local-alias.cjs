const { pathToFileURL } = require('url');

function createAliasPackageManifest(version) {
    return {
        name: 'happy-fe-local',
        private: true,
        version,
        bin: {
            'happy-fe': './bin/happy-fe.mjs',
            'happy-fe-mcp': './bin/happy-fe-mcp.mjs',
        },
    };
}

function createLauncherSource(targetPath) {
    return `#!/usr/bin/env node
import ${JSON.stringify(pathToFileURL(targetPath).href)};
`;
}

module.exports = {
    createAliasPackageManifest,
    createLauncherSource,
};
