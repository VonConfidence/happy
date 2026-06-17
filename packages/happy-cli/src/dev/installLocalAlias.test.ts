import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const {
    createAliasPackageManifest,
    createLauncherSource,
} = require('../../scripts/install-local-alias.cjs');

describe('install-local alias helpers', () => {
    it('creates a manifest for the happy-fe alias package', () => {
        expect(createAliasPackageManifest('1.2.3')).toEqual({
            name: 'happy-fe-local',
            private: true,
            version: '1.2.3',
            bin: {
                'happy-fe': './bin/happy-fe.mjs',
                'happy-fe-mcp': './bin/happy-fe-mcp.mjs',
            },
        });
    });

    it('creates a launcher that imports the real CLI entrypoint by file url', () => {
        const targetPath = '/Users/confidence/Documents/happy/packages/happy-cli/bin/happy.mjs';
        const launcher = createLauncherSource(targetPath);

        expect(launcher).toContain('#!/usr/bin/env node');
        expect(launcher).toContain(`import ${JSON.stringify(pathToFileURL(targetPath).href)};`);
    });
});
