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

var repo = 'library/mongo';
var idx = docker.createIndexClient();
idx.getRepoAuth({repo: repo}, function (err, repoAuth, res) {
    if (err) {
        return console.error(err.message);
    }
    return console.log(JSON.stringify(repoAuth, null, 4));
});
