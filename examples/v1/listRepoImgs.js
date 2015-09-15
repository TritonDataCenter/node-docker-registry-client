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
var cmd = 'listRepoImgs';
mainline({cmd: cmd}, function (log, parser, opts, args) {
    var name = args[0];
    if (!name) {
        console.error('usage: node examples/v1/%s.js REPO\n' +
            '\n' +
            'options:\n' +
            '%s', cmd, parser.help().trimRight());
        process.exit(2);
    }


    // The interesting stuff starts here.
    var client = drc.createClientV1({
        name: name,
        log: log,
        insecure: opts.insecure,
        username: opts.username,
        password: opts.password
    });
    client.listRepoImgs(function (err, imgs) {
        client.close();
        if (err) {
            mainline.fail(cmd, err, opts);
        }
        console.log(JSON.stringify(imgs, null, 4));
    });

});
