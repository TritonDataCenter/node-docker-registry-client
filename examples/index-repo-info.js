#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var clients = require('../lib/clients');


// XXX: use node-cmdln for subcommands
var idx = clients.index.create({});
var repo = 'library/mongo';

idx.getRepository(repo, function (err, res) {
    if (err) {
        return console.error(err.message);
    }

    return console.log(JSON.stringify(res, null, 2));
});
