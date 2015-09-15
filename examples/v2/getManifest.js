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
var cmd = 'getManifest';
mainline({cmd: cmd}, function (log, parser, opts, args) {
    var name = args[0];
    if (!name) {
        console.error('usage: node examples/v2/%s.js REPO[:TAG|@DIGEST]\n' +
            '\n' +
            'options:\n' +
            '%s', cmd, parser.help().trimRight());
        process.exit(2);
    }


    // The interesting stuff starts here.
    var rat = drc.parseRepoAndTag(name);
    drc.createClient({
        name: rat.localName,
        agent: false,
        log: log,
        username: opts.username,
        password: opts.password
    }, function (clientErr, client) {
        if (clientErr) {
            mainline.fail(cmd, clientErr, opts);
        }
        client.getManifest({ref: rat.tag || rat.digest},
                function (err, manifest) {
            client.close();
            if (err) {
                mainline.fail(cmd, err, opts);
            }
            console.log(JSON.stringify(manifest, null, 4));
        });
    });
});
