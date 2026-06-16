const fs = require('fs');
const path = require('path');

const files = [
    'node_modules/react-native-audio-api/common/cpp/audioapi/core/Constants.h',
    'packages/happy-app/node_modules/react-native-audio-api/common/cpp/audioapi/core/Constants.h',
];

let patched = 0;

for (const file of files) {
    const filePath = path.resolve(__dirname, '..', file);
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    if (!content.includes('#include <cstddef>')) {
        content = content.replace(
            '#pragma once\n\n',
            '#pragma once\n\n#include <cstddef>\n'
        );
    }

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        patched++;
    }
}

if (patched > 0) {
    console.log(`[patch] Fixed react-native-audio-api size_t include (${patched} file(s))`);
}
