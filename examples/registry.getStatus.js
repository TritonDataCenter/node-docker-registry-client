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

var reg = docker.createRegistryClient();
reg.getStatus(function (err, status, res) {
    if (err) {
        console.error(err.message);
        return;
    }
    console.log('status: %j', status);
    console.log('HTTP status: %s', res.statusCode);
});
