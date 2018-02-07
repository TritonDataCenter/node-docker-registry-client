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
        callback(null, sha256.read().toString('hex'));
    });

    stream.on('error', function (streamErr) {
        callback(streamErr);
    });

    stream.pipe(sha256);
}

// Shared mainline with examples/foo.js to get CLI opts.
var cmd = 'putManifest';
mainline({cmd: cmd}, function (log, parser, opts, args) {
    if (!args[0] || (args[0].indexOf(':') === -1 && !args[1])) {
        console.error('usage: node examples/v2/%s.js REPO[:TAG|@DIGEST] ' +
            'manifest-file\n\n' +
            'options:\n' +
            '%s', cmd, parser.help().trimRight());
        process.exit(2);
    }

    // The interesting stuff starts here.
    var rar = drc.parseRepoAndRef(args[0]);
    assert.ok(rar.canonicalName, 'must specify a repo');
    var ref = rar.tag || rar.digest;
    assert.ok(ref, 'must specify a tag or digest');

    console.log('Repo:', rar.canonicalName + ':' + ref);

    var filepath = args[1];
    assert.string(filepath, 'must specify a blob filepath');
    var contents = fs.readFileSync(filepath).toString();

    var client = drc.createClientV2({
        repo: rar,
        log: log,
        insecure: opts.insecure,
        username: opts.username,
        password: opts.password
    });

    console.log('Uploading manifest: %s', filepath);
    var manifestOpts = {
        manifest: contents,
        ref: ref
    };
    client.putManifest(manifestOpts,
            function (uploadErr, res, digest, location) {
        if (uploadErr) {
            mainline.fail(cmd, uploadErr, opts);
        }

        console.log('Upload successful => digest:', digest,
            'location:', location);
        client.close();
    });
});
