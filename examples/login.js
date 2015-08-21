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
 * This shows roughly how a Docker Engine would handle the server-side of
 * a "check auth" Remote API request:
 *      // JSSTYLED
 *      http://docs.docker.com/reference/api/docker_remote_api_v1.18/#check-auth-configuration
 * as is called by `docker login`.
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

var indexName = process.argv[2] || 'docker.io';
if (!indexName) {
    console.error('usage: node examples/%s.js [INDEX]', cmd);
    process.exit(2);
}


var username;
var email;
var password;
vasync.pipeline({funcs: [
    function getUsername(_, next) {
        read({prompt: 'Username:'}, function (err, val) {
            if (err) {
                return next(err);
            }
            username = val.trim();
            next();
        });
    },
    function getPassword(_, next) {
        read({prompt: 'Password:', silent: true}, function (err, val) {
            if (err) {
                return next(err);
            }
            password = val.trim();
            next();
        });
    },
    function getEmail(_, next) {
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
        }, function (err, body) {
            if (err) {
                next(err);
            } else if (body.Status) {
                console.log(body.Status);
                next();
            }
        });
    }
]}, function (err) {
    if (err) {
        fail(err);
    }
});
