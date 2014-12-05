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

// Default to "library/mongo:latest".
var rat = docker.parseRepoAndTag(
        process.argv.length > 2 ? process.argv[2] : 'mongo');

docker.createRegistrySession({repo: rat.repo}, function (err, sess) {
    if (err) {
        console.error(err.message);
        return;
    }
    sess.listRepoTags(function (listErr, repoTags) {
        // The `|| rat.tag` is a hack to allow passing in a specific untagged
        // imgId.
        var imgId = repoTags[rat.tag] || rat.tag;

        sess.getImgAncestry({imgId: imgId}, function (getErr, ancestry) {
            if (getErr) {
                console.error(getErr.message);
                return;
            }
            console.log(JSON.stringify(ancestry, null, 4));
        });
    });
});
