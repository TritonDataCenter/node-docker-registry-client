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
var cmd = 'getImgId';
mainline({cmd: cmd}, function (log, parser, opts, args) {
    var repoAndTag = args[0];
    if (!repoAndTag) {
        console.error('usage: node examples/v1/%s.js REPO:TAG\n' +
            '\n' +
            'options:\n' +
            '%s', cmd, parser.help().trimRight());
        process.exit(2);
    }

    // The interesting stuff starts here.
    var rat = drc.parseRepoAndTag(repoAndTag);
    console.error('# repo: %s', rat.canonicalName);
    console.error('# tag:  %s', rat.tag);

    var client = drc.createClientV1({
        scheme: rat.index.scheme,
        name: rat.canonicalName,
        log: log,
        insecure: opts.insecure,
        username: opts.username,
        password: opts.password
    });
    client.getImgId({tag: rat.tag}, function (err, imgId) {
        client.close();
        if (err) {
            mainline.fail(cmd, err, opts);
        }
        console.log(imgId);
    });
});
