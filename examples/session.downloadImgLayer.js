#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var bunyan = require('bunyan');
var docker = require('../');
var fs = require('fs');

var log;
if (process.env.TRACE) {
    log = bunyan.createLogger({
        name: require('path').basename(__filename),
        level: 'trace'
    });
}

// Default to "library/mongo:latest".
var rat = docker.parseRepoAndTag(
        process.argv.length > 2 ? process.argv[2] : 'mongo');

docker.createRegistrySession({repo: rat.repo, log: log},
        function (sessErr, sess) {
    if (sessErr) {
        console.error(sessErr.message);
        return;
    }
    sess.listRepoTags(function (listErr, repoTags) {
        // The `|| rat.tag` is a hack to allow passing in a specific untagged
        // imgId.
        var imgId = repoTags[rat.tag] || rat.tag;
        sess.getImgLayerStream({imgId: imgId}, function (getErr, stream) {
            if (getErr) {
                console.error(getErr.message);
                return;
            }

            var shortId = imgId.slice(0, 12);
            console.log('Downloading img %s layer to "./%s.layer", headers:',
                shortId, shortId);
            console.log(JSON.stringify(stream.headers, null, 4));

            var fout = fs.createWriteStream(shortId + '.layer');
            fout.on('finish', function () {
                console.log('Done downloading image layer');
                // TODO: if we `source.getImgMeta` then we can check the
                // downloaded size.
            });

            stream.on('error', function (err) {
                console.error('Error downloading:', err);
            });
            fout.on('error', function (err) {
                console.error('Error writing:', err);
            });

            stream.pipe(fout);
            stream.resume();
        });
    });
});
