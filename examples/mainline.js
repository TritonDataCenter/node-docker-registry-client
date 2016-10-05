/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Shared code for some of the examples in this dir to get CLI options.
 */

var assert = require('assert-plus');
var bunyan = require('bunyan');
var dashdash = require('dashdash');
var format = require('util').format;
var read = require('read');


var options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Print this help and exit.'
    },
    {
        names: ['verbose', 'v'],
        type: 'bool',
        help: 'Verbose logging.'
    },
    {
        names: ['username', 'u'],
        type: 'string',
        help: 'Basic auth username'
    },
    {
        names: ['password', 'p'],
        type: 'string',
        help: 'Basic auth password'
    },
    {
        names: ['insecure', 'k'],
        type: 'bool',
        help: 'Allow insecure SSL connections (i.e. do not enforce SSL certs)'
    },
    {
        names: ['schema', 's'],
        type: 'number',
        help: 'Maximum schema version to request (1 or 2, defaults to 1)'
    }
];

var optionsNoAuth = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Print this help and exit.'
    },
    {
        names: ['verbose', 'v'],
        type: 'bool',
        help: 'Verbose logging.'
    },
    {
        names: ['insecure', 'k'],
        type: 'bool',
        help: 'Allow insecure SSL connections (i.e. do not enforce SSL certs)'
    },
    {
        names: ['schema', 's'],
        type: 'number',
        help: 'Maximum schema version to request (1 or 2, defaults to 1)'
    }
];


function fail(cmd, err, opts) {
    assert.optionalObject(opts, 'opts');
    opts = opts || {};

    var errToShow = opts.verbose ? err.stack || err : err.message || err;
    console.error('%s: error: %s', cmd, errToShow);
    process.exit(2);
}


function mainline(config, cb) {
    assert.string(config.cmd, 'config.cmd');
    assert.optionalBool(config.excludeAuth, 'config.excludeAuth');
    assert.optionalObject(config.options, 'config.options');

    var dashOpts = (config.excludeAuth ? optionsNoAuth : options);
    if (config.options) {
        // Add to existing options.
        dashOpts = dashOpts.concat(config.options);
    }
    var parser = dashdash.createParser({
        options: dashOpts
    });
    try {
        var opts = parser.parse(process.argv);
    } catch (e) {
        fail(config.cmd, e);
    }

    var logLevel = 'warn';
    if (opts.verbose) {
        logLevel = 'trace';
    }
    var log = bunyan.createLogger({
        name: config.cmd,
        level: logLevel
    });

    // Handle password prompt, if necessary.
    if (opts.username && !opts.password) {
        var readOpts = {
            prompt: format('Password for %s: ', opts.username),
            silent: true
        };
        read(readOpts, function (rErr, password) {
            if (rErr) {
                return fail(config.cmd, rErr);
            }
            opts.password = password.trim();
            cb(log, parser, opts, opts._args);
        });
    } else {
        cb(log, parser, opts, opts._args);
    }
}


module.exports = mainline;
module.exports.fail = fail;
