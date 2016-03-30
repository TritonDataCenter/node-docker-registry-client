#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2016, Joyent, Inc.
 */

/* BEGIN JSSTYLED */
/*
 * Login to a Docker Registry (whether it is v1 or v2).
 *
 * There is a catch with supposed v1 support: In Docker 1.11 (Docker Remote API
 * version 1.23) they dropped including the "email" field in the "POST /auth"
 * request to the Docker Engine. This script will not prompt for email if
 * not given as an argument -- and then won't work against a v1 registry.
 * Basically: v1 is getting phased out.
 *
 * Usage:
 *      node examples/login.js [INDEX-NAME] [USERNAME] [PASSWORD] [EMAIL]
 *
 * Run with TRACE=1 envvar to get trace-level logging.
 *
 * Example:
 *      # If not given, INDEX-NAME defaults to the appropriate Docker Hub
 *      # index URL.
 *      $ node examples/login.js
 *      Username: bob
 *      Password:
 *
 *      login: error: token auth attempt for https://index.docker.io/v1/: https://auth.docker.io/token?service=registry.docker.io&account=bob request failed with status 401: {"details":"incorrect username or password"}
 */
/* END JSSTYLED */

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
    function doLogin(_, next) {
        drc.login({
            indexName: indexName,
            log: log,
            // TODO: insecure: insecure,
            // auth info:
            username: username,
            password: password,
            email: email
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
