#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2016 Joyent, Inc.
 */

var assert = require('assert-plus');

var drc = require('../../');
var mainline = require('../mainline');

// Shared mainline with examples/foo.js to get CLI opts.
var cmd = 'headBlob';
mainline({cmd: cmd}, function (log, parser, opts, args) {
    var name = args[0];
    if (!name) {
        console.error('usage: node examples/v2/%s.js REPO@DIGEST\n' +
            '\n' +
            'options:\n' +
            '%s', cmd, parser.help().trimRight());
        process.exit(2);
    }


    // The interesting stuff starts here.
    var rat = drc.parseRepoAndRef(name);
    assert.ok(rat.digest, 'must specify a @DIGEST');
    var client = drc.createClientV2({
        repo: rat,
        log: log,
        insecure: opts.insecure,
        username: opts.username,
        password: opts.password
    });
    client.headBlob({digest: rat.digest}, function (err, ress) {
        client.close();
        if (err) {
            mainline.fail(cmd, err, opts);
        }
        for (var i = 0; i < ress.length; i++) {
            console.log('# response %d headers', i+1);
            console.log(JSON.stringify(ress[i].headers, null, 4));
        }
    });
});
