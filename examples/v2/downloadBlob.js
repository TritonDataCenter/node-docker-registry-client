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
var fs = require('fs');

var drc = require('../../');
var mainline = require('../mainline');


// Shared mainline with examples/foo.js to get CLI opts.
var cmd = 'downloadBlob';
mainline({cmd: cmd}, function (log, parser, opts, args) {
    if (!args[0] || (args[0].indexOf(':') === -1 && !args[1])) {
        console.error('usage: node examples/v2/%s.js REPO@DIGEST\n' +
            '\n' +
            'options:\n' +
            '%s', cmd, parser.help().trimRight());
        process.exit(2);
    }

    // The interesting stuff starts here.
    var rar = drc.parseRepoAndRef(args[0]);
    assert.ok(rar.digest, 'must specify a @DIGEST');
    console.log('Repo:', rar.canonicalName);

    var client = drc.createClientV2({
        repo: rar,
        log: log,
        insecure: opts.insecure,
        username: opts.username,
        password: opts.password
    });

    client.createBlobReadStream({digest: rar.digest},
            function (createErr, stream, ress) {
        if (createErr) {
            mainline.fail(cmd, createErr, opts);
        }

        var filename = rar.digest.split(':')[1].slice(0, 12) + '.blob';
        console.log('Downloading blob to "%s".', filename);
        console.log('Response headers:');
        console.log(JSON.stringify(ress[0].headers, null, 4));
        if (ress.length > 1) {
            console.log('Response headers (after redirects):');
            console.log(JSON.stringify(ress[ress.length - 1].headers, null, 4));
        }

        var fout = fs.createWriteStream(filename);
        fout.on('finish', function () {
            client.close();
            console.log('Done downloading blob (client verified ' +
                'Content-Length and Docker-Content-Digest).');
        });

        stream.on('error', function (err) {
            mainline.fail(cmd, 'error downloading: ' + err);
        });
        fout.on('error', function (err) {
            mainline.fail(cmd, 'error writing: ' + err);
        });

        stream.pipe(fout);
        stream.resume();
    });

});
