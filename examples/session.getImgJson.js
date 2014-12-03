#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var docker = require('../');
var bunyan = require('bunyan');

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
                            function (err, sess, repoImgs) {
    if (err) {
        console.error(err.message);
        return;
    }
    sess.listRepoTags(function (listErr, repoTags) {
        // The `|| rat.tag` is a hack to allow passing in a specific untagged
        // imgId.
        var imgId = repoTags[rat.tag] || rat.tag;
        sess.getImgJson({imgId: imgId}, function (getErr, imgJson, res) {
            if (getErr) {
                console.error(getErr.message);
                return;
            }
            console.log(JSON.stringify(imgJson, null, 4));
            console.log(JSON.stringify(res.headers, null, 4));
            console.log('size:', res.headers['x-docker-size']);

            // If present, dump the checksum from the `repoImgs` data from the
            // *index* API.
            var checksum;
            var repoImg = repoImgs.filter(
                function (ri) { return ri.id === imgId; });
            if (repoImg.length) {
                checksum = repoImg.checksum;
            }
            console.log('checksum (from Index API):', checksum || '(none)');
        });
    });
});
