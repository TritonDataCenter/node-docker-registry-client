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
var format = require('util').format;
var fs = require('fs');
var mainline = require('../mainline');


// Shared mainline with examples/foo.js to get CLI opts.
var cmd = 'downloadImgLayer';
mainline({cmd: cmd}, function (log, parser, opts, args) {
    if (!args[0] || (args[0].indexOf(':') === -1 && !args[1])) {
        console.error('usage:\n' +
            '    node examples/v1/%s.js REPO:TAG\n' +
            '    node examples/v1/%s.js REPO IMAGE-ID\n' +
            '\n' +
            'options:\n' +
            '%s', cmd, cmd, parser.help().trimRight());
        process.exit(2);
    }


    // The interesting stuff starts here.
    var client, imgId;
    if (args[0].indexOf(':') !== -1) {
        // Lookup by REPO:TAG.
        var rat = drc.parseRepoAndTag(args[0]);
        console.log('Repo:', rat.canonicalName);
        client = drc.createClientV1({
            scheme: rat.index.scheme,
            name: rat.canonicalName,
            log: log,
            insecure: opts.insecure,
            username: opts.username,
            password: opts.password
        });
        client.getImgId({tag: rat.tag}, function (err, imgId_) {
            if (err) {
                mainline.fail(cmd, err, opts);
            }
            imgId = imgId_;
            console.log('imgId:', imgId);
            client.getImgLayerStream({imgId: imgId}, saveStreamToFile);
        });
    } else {
        // Lookup by REPO & IMAGE-ID.
        console.log('Repo:', args[0]);
        client = drc.createClientV1({
            name: args[0],
            log: log,
            insecure: opts.insecure,
            username: opts.username,
            password: opts.password
        });
        imgId = args[1];
        console.log('imgId:', imgId);
        client.getImgLayerStream({imgId: imgId}, saveStreamToFile);
    }

    function saveStreamToFile(getErr, stream) {
        if (getErr) {
            mainline.fail(cmd, getErr);
        }

        var shortId = imgId.slice(0, 12);
        console.log('Downloading img %s layer to "./%s.layer".',
            shortId, shortId);
        console.log('Response headers:');
        console.log(JSON.stringify(stream.headers, null, 4));

        var fout = fs.createWriteStream(shortId + '.layer');
        fout.on('finish', function () {
            client.close();
            console.log('Done downloading image layer.');
            var len = Number(stream.headers['content-length']);
            if (len !== NaN) {
                if (len !== numBytes) {
                    mainline.fail(cmd, format('Unexpected download size: ' +
                        'downloaded %d bytes, Content-Length header was %d.',
                        numBytes, len));
                } else {
                    console.log('Downloaded %s bytes (matching ' +
                        'Content-Length header).', numBytes);
                }
            }
        });

        var numBytes = 0;
        stream.on('data', function (chunk) {
            numBytes += chunk.length;
        });

        stream.on('error', function (err) {
            mainline.fail(cmd, 'error downloading: ' + err);
        });
        fout.on('error', function (err) {
            mainline.fail(cmd, 'error writing: ' + err);
        });

        stream.pipe(fout);
        stream.resume();
    }
});
