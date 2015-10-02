#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Login to a Docker Registry (whether it is v1 or v2).
 *
 * Usage:
 *      node examples/login.js [INDEX-NAME]
 *
 * Run with TRACE=1 envvar to get trace-level logging.
 *
 * Example:
 *      $ node examples/login.js
 *      Username: bob
 *      Password:
 *      Email: bob@example.com
 *
 *      Wrong login/password, please try again
 */

var bunyan = require('bunyan');
var format = require('util').format;
var read = require('read');
var vasync = require('vasync');

var drc = require('../');



// --- globals

var cmd = 'login';



// --- internal support stuff

function fail(err) {
    console.error('%s: error: %s', cmd, err.message || err);
    process.exit(2);
}


// --- mainline

var logLevel = 'warn';
if (process.env.TRACE) {
    logLevel = 'trace';
}
var log = bunyan.createLogger({
    name: cmd,
    level: logLevel
});


// `docker login` with no args passes
// `serveraddress=https://index.docker.io/v1/` (yes, "v1", even in a v2 world).
var indexName = process.argv[2] || 'https://index.docker.io/v1/';
if (indexName === '-h' || indexName === '--help') {
    console.error('usage: node examples/v2/%s.js [INDEX] [USERNAME] ' +
        '[PASSWORD] [EMAIL]', cmd);
    process.exit(2);
}

var username = process.argv[3];
var password = process.argv[4];
var email = process.argv[5];
vasync.pipeline({funcs: [
    function getUsername(_, next) {
        if (username) {
            return next();
        }
        read({prompt: 'Username:'}, function (err, val) {
            if (err) {
                return next(err);
            }
            username = val.trim();
            next();
        });
    },
    function getPassword(_, next) {
        if (password) {
            return next();
        }
        read({prompt: 'Password:', silent: true}, function (err, val) {
            if (err) {
                return next(err);
            }
            password = val.trim();
            next();
        });
    },
    function getEmail(_, next) {
        if (email) {
            return next();
        }
        read({prompt: 'Email:'}, function (err, val) {
            if (err) {
                return next(err);
            }
            email = val.trim();
            console.log();
            next();
        });
    },
    function doLogin(_, next) {
        drc.login({
            indexName: indexName,
            log: log,
            // TODO: insecure: insecure,
            // auth info:
            username: username,
            email: email,
            password: password
        }, function (err, result) {
            if (err) {
                next(err);
            } else {
                console.log('Result:', JSON.stringify(result, null, 4));
                next();
            }
        });
    }
]}, function (err) {
    if (err) {
        fail(err);
    }
});
