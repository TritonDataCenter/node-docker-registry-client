/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

var assert = require('assert-plus');
var fmt = require('util').format;
var restify = require('restify');
var vasync = require('vasync');
var VError = require('verror').VError;

var common = require('./common');
var reg1 = require('./registry-client-v1');



/**
 * Ping a given Docker *index* URL (as opposed to a registry that requires
 * a repo name).
 */
function pingIndex(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.indexName, 'opts.indexName');
    assert.optionalBool(opts.insecure, 'opts.insecure');
    assert.optionalObject(opts.log, 'opts.log');
    assert.optionalString(opts.userAgent, 'opts.userAgent');
    assert.func(cb, 'cb');

    var index = common.parseIndex(opts.indexName);
    var client = restify.createJsonClient({
        url: common.urlFromIndex(index),
        log: opts.log,
        userAgent: opts.userAgent || common.DEFAULT_USERAGENT,
        rejectUnauthorized: !opts.insecure
    });

    client.get({
        path: '/v1/_ping'
    }, function _afterPing(err, req, res, obj) {
        client.close();
        if (err) {
            return cb(err);
        }
        return cb(null, obj, res);
    });
}


/**
 * Login V1
 *
 * This attempts to reproduce the logic of "docker.git:registry/auth.go#loginV1"
 *
 * @param opts {Object}
 * @param opts.indexName {String} Either an indexName that `parseIndex`
 *      will handle, or an index URL (e.g. the default from `docker login` is
 *      'https://index.docker.io/v1/').
 * ...
 * @param cb {Function} `function (err, body)`
 *      On success, `body` has a "Status" string field if there is any status
 *      message.
 */
function login(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.indexName, 'opts.indexName');
    assert.string(opts.username, 'opts.username');
    assert.string(opts.email, 'opts.email');
    assert.string(opts.password, 'opts.password');
    assert.optionalBool(opts.insecure, 'opts.insecure');
    assert.optionalObject(opts.log, 'opts.log');
    assert.optionalString(opts.userAgent, 'opts.userAgent');
    assert.func(cb, 'cb');

    // `docker login` with no args passes
    // `serveraddress=https://index.docker.io/v1/`. Let's not blow up on that.
    var indexUrl, indexOfficial;
    try {
        var index = common.parseIndex(opts.indexName);
        indexUrl = common.urlFromIndex(index);
        indexOfficial = index.official;
    } catch (parseErr) {
        indexUrl = opts.indexName;
        indexOfficial = (indexUrl === 'https://index.docker.io/v1/');
    }

    var client = restify.createJsonClient({
        url: indexUrl,
        log: opts.log,
        retry: false, // Fail fast. We don't want 15s of retrying.
        userAgent: opts.userAgent || common.DEFAULT_USERAGENT,
        agent: opts.agent,
        proxy: opts.proxy,
        headers: opts.headers,
        rejectUnauthorized: !opts.insecure
    });
    var status;

    vasync.pipeline({arg: {}, funcs: [
        /*
         * This *can* create a user (e.g. on Docker Hub). Typically though the
         * statusCode is used to determine next steps.
         */
        function createUser(ctx, next) {
            client.post({
                path: '/v1/users/'
            }, {
                username: opts.username,
                email: opts.email,
                password: opts.password
            }, function _afterCreateUser(err, req, res, body) {
                if (err && !res) {  // e.g. connect error
                    return next(err);
                }
                ctx.createStatusCode = res.statusCode;
                ctx.createErr = err;
                ctx.createBody = body;
                next();
            });
        },

        function handle201(ctx, next) {
            if (ctx.createStatusCode !== 201) {
                return next();
            }
            if (indexOfficial) {
                status = 'Account created. Please use the confirmation ' +
                    'link we sent to your e-mail to activate it.';
            } else {
                status = 'Account created. Please see the documentation ' +
                    'of the registry ' + opts.indexName +
                    ' for instructions how to activate it.';
            }
            next(true);
        },

        function handle400(ctx, next) {
            if (ctx.createStatusCode !== 400) {
                return next();
            }
            if (ctx.createBody !== 'Username or email already exists') {
                return next(new Error(fmt('Registration: %j', ctx.createBody)));
            }

            client.basicAuth(opts.username, opts.password);
            client.get({
                path: '/v1/users/'
            }, function (err, req, res, body) {
                if (res.statusCode === 200) {
                    status = 'Login Succeeded';
                    next(true);
                } else if (res.statusCode === 401) {
                    next(new Error('Wrong login/password, please try again'));
                } else if (res.statusCode === 403) {
                    if (indexOfficial) {
                        next(new Error('Login: Account is not Active. ' +
                            'Please check your e-mail for a confirmation ' +
                            'link.'));
                    } else {
                        next(new Error('Login: Account is not Active. ' +
                            'Please see the documentation of the registry ' +
                            opts.indexName + ' for instructions how to ' +
                            'activate it.'));
                    }
                } else {
                    next(new Error(fmt('Login: %s (Code: %d; Headers: %j)',
                        body, res.statusCode, res.headers)));
                }
            });
        },

        function handle401(ctx, next) {
            if (ctx.createStatusCode !== 401) {
                return next();
            }

            client.basicAuth(opts.username, opts.password);
            client.get({
                path: '/v1/users/'
            }, function (err, req, res, body) {
                if (res.statusCode === 200) {
                    status = 'Login Succeeded';
                    next(true);
                } else if (res.statusCode === 401) {
                    next(new Error('Wrong login/password, please try again'));
                } else {
                    next(new Error(fmt('Login: %s (Code: %d; Headers: %j)',
                        body, res.statusCode, res.headers)));
                }
            });
        },

        function handleOther(ctx, next) {
            var msg = fmt('Unexpected status code [%d] : %s',
                ctx.createStatusCode, ctx.createBody);
            if (ctx.createErr) {
                next(new VError(ctx.createErr, msg));
            } else {
                next(new Error(msg));
            }
        }

    ]}, function (err) {
        if (err === true) { // Signal for early abort.
            err = null;
        }
        client.close();
        if (err) {
            cb(err);
        } else {
            cb(null, {Status: status});
        }
    });
}



// --- exports

module.exports = {
    pingIndex: pingIndex,
    login: login,
    createClient: reg1.createClient,

    DEFAULT_INDEX_NAME: common.DEFAULT_INDEX_NAME,
    DEFAULT_TAG: common.DEFAULT_TAG,
    parseRepo: common.parseRepo,
    parseIndex: common.parseIndex,
    parseRepoAndTag: common.parseRepoAndTag
};
