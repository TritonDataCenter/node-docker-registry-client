#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * An example showing how an index (a.k.a. repository host) string is parsed.
 * Example:
 *      node examples/parseIndex.js docker.io
 */

var drc = require('../');

if (process.argv.length < 2) {
    console.error(
        'usage:\n' +
        '    node examples/parseIndex.js INDEX\n');
    process.exit(2);

}

var idx = drc.parseIndex(process.argv[2]);
console.log(JSON.stringify(idx, null, 4));
