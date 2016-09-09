#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2016 Joyent, Inc.
 */

var drc = require('../../');
var mainline = require('../mainline');

// Shared mainline with examples/foo.js to get CLI opts.
var cmd = 'getManifest';
var dashOpts = [
    {
        names: ['schema', 's'],
        type: 'number',
        help: 'Schema version to request (1 or 2, defaults to 1)'
    }
];
mainline({cmd: cmd, options: dashOpts}, function (log, parser, opts, args) {
    var name = args[0];
    if (!name) {
        console.error('usage: node examples/v2/%s.js REPO[:TAG|@DIGEST]\n' +
            '\n' +
            'options:\n' +
            '%s', cmd, parser.help().trimRight());
        process.exit(2);
    }


    // The interesting stuff starts here.
    var rar = drc.parseRepoAndRef(name);
    var client = drc.createClientV2({
        repo: rar,
        log: log,
        insecure: opts.insecure,
        username: opts.username,
        password: opts.password
    });
    var getOpts = {
        ref: rar.tag || rar.digest,
        maxSchemaVersion: (opts.schema || 1)
    };
    client.getManifest(getOpts, function (err, manifest, res) {
        client.close();
        if (err) {
            mainline.fail(cmd, err, opts);
        }
        console.error('# response headers');
        console.error(JSON.stringify(res.headers, null, 4));
        console.error('# manifest');
        console.log(JSON.stringify(manifest, null, 4));
    });
});
