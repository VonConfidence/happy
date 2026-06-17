#!/usr/bin/env node

/**
 * Install this workspace as the global `happy-fe` binary for local development
 * without replacing the user's existing `happy` installation.
 */

const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');
const { mkdirSync, writeFileSync } = require('fs');
const {
    createAliasPackageManifest,
    createLauncherSource,
} = require('./install-local-alias.cjs');

const PACKAGE_DIR = path.resolve(__dirname, '..');
const IS_WINDOWS = process.platform === 'win32';
const LOCAL_ALIAS_DIR = path.join(os.homedir(), '.happy', 'local-cli-links', 'happy-fe');
const LOCAL_ALIAS_BIN_DIR = path.join(LOCAL_ALIAS_DIR, 'bin');

function run(cmd, args, { allowFailure = false, cwd = PACKAGE_DIR } = {}) {
    const label = [cmd, ...args].join(' ');
    console.log(`\n▶ ${label}`);
    const result = spawnSync(cmd, args, {
        cwd,
        stdio: 'inherit',
        shell: IS_WINDOWS,
    });
    if (result.error) {
        console.error(`Failed to spawn: ${label}`, result.error.message);
        if (!allowFailure) process.exit(1);
        return 1;
    }
    const status = result.status ?? 1;
    if (status !== 0 && !allowFailure) {
        console.error(`\nExit ${status}: ${label}`);
        process.exit(status);
    }
    return status;
}

function writeAliasPackage() {
    const packageJson = require(path.join(PACKAGE_DIR, 'package.json'));
    mkdirSync(LOCAL_ALIAS_BIN_DIR, { recursive: true });
    writeFileSync(
        path.join(LOCAL_ALIAS_DIR, 'package.json'),
        `${JSON.stringify(createAliasPackageManifest(packageJson.version), null, 2)}\n`,
        'utf8',
    );
    writeFileSync(
        path.join(LOCAL_ALIAS_BIN_DIR, 'happy-fe.mjs'),
        createLauncherSource(path.join(PACKAGE_DIR, 'bin', 'happy.mjs')),
        { encoding: 'utf8', mode: 0o755 },
    );
    writeFileSync(
        path.join(LOCAL_ALIAS_BIN_DIR, 'happy-fe-mcp.mjs'),
        createLauncherSource(path.join(PACKAGE_DIR, 'bin', 'happy-mcp.mjs')),
        { encoding: 'utf8', mode: 0o755 },
    );
}

run('pnpm', ['run', 'build']);
writeAliasPackage();
run('happy-fe', ['daemon', 'stop'], { allowFailure: true });
run('happy', ['daemon', 'stop'], { allowFailure: true });
run('npm', ['link'], { cwd: LOCAL_ALIAS_DIR });
run('happy-fe', ['daemon', 'start']);
run('happy-fe', ['--version']);

console.log(`\n✓ Installed happy-fe from ${PACKAGE_DIR}`);
console.log(`  Alias package: ${LOCAL_ALIAS_DIR}`);
console.log('  To undo: npm uninstall -g happy-fe-local');
