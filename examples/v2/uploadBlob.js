#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2017 Joyent, Inc.
 */

var assert = require('assert-plus');
var crypto = require('crypto');
var fs = require('fs');
var vasync = require('vasync');

var drc = require('../../');
var mainline = require('../mainline');

function getFileSha256(filepath, callback) {
    var sha256 = crypto.createHash('sha256');
    var stream = fs.createReadStream(filepath);

    sha256.on('readable', function () {
        var digest = sha256.read();
        if (digest) {
            callback(null, digest.toString('hex'));
        }
    });

    stream.on('error', function (streamErr) {
        callback(streamErr);
    });

    stream.pipe(sha256);
}

// Shared mainline with examples/foo.js to get CLI opts.
var cmd = 'uploadBlob';
mainline({cmd: cmd}, function (log, parser, opts, args) {
    if (!args[0] || (args[0].indexOf(':') === -1 && !args[1])) {
        console.error('usage: node examples/v2/%s.js REPO blob-file\n' +
            '\n' +
            'options:\n' +
            '%s', cmd, parser.help().trimRight());
        process.exit(2);
    }

    // The interesting stuff starts here.
    var rar = drc.parseRepoAndRef(args[0]);
    assert.ok(rar.canonicalName, 'must specify a repo');
    console.log('Repo:', rar.canonicalName);

    var filepath = args[1];
    assert.string(filepath, 'must specify a blob filepath');
    var fileSize = fs.statSync(filepath).size;

    getFileSha256(filepath, function (err, sha256) {
        var client = drc.createClientV2({
            insecure: opts.insecure,
            log: log,
            repo: rar,
            username: opts.username,
            password: opts.password
        });

        var digest = 'sha256:' + sha256;
        var stream = fs.createReadStream(filepath);
        var blobOpts = {
            contentLength: fileSize,
            digest: digest,
            stream: stream
        };
        console.log('Uploading blob: %s, digest: %s', filepath, digest);
        client.blobUpload(blobOpts, function (uploadErr, ress) {
            if (uploadErr) {
                mainline.fail(cmd, uploadErr, opts);
            }

            console.log('Response headers:');
            console.log(JSON.stringify(ress.headers, null, 4));
            if (ress.length > 1) {
                console.log('Response headers (after redirects):');
                console.log(JSON.stringify(ress[ress.length - 1].headers,
                    null, 4));
            }

            console.log('Body:\n%s', ress.body);
            client.close();
        });
    });
});
