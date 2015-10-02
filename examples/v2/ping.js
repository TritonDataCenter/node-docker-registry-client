#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

var drc = require('../../');
var mainline = require('../mainline');

// Shared mainline with examples/foo.js to get CLI opts.
var cmd = 'ping';
mainline({cmd: cmd}, function (log, parser, opts, args) {
    if (opts.help) {
        console.error('usage: node examples/v2/%s.js [INDEX]\n' +
            '\n' +
            'options:\n' +
            '%s', cmd, parser.help().trimRight());
        process.exit(0);
    }

    // `docker login` defaults to this URL. Let's do the same.
    var indexName = args[0] || 'https://index.docker.io/v1/';

    // The interesting stuff starts here.
    drc.pingV2({
        indexName: indexName,
        log: log,
        username: opts.username,
        password: opts.password,
        insecure: opts.insecure
    }, function (err, body, res, req) {
        if (res) {
            console.log('HTTP status: %s', res.statusCode);
            console.log('Headers:', JSON.stringify(res.headers, null, 4));
            if (res.statusCode === 200) {
                console.log('Body: ', JSON.stringify(body, null, 4));
            }
        }
        if (err) {
            mainline.fail(cmd, err, opts);
        }
    });
});
