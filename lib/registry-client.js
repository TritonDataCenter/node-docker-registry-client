/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Docker Registry API client. See the README for an intro.
 * <https://docs.docker.com/reference/api/registry_api/>
 * <https://docs.docker.com/reference/api/hub_registry_spec/>
 */

var assert = require('assert-plus');
var bunyan = require('bunyan');
var fmt = require('util').format;
var mod_url = require('url');
var restify = require('restify');
var util = require('util');

var index_client = require('./index-client');



// --- Globals

var REGISTRY_URL = 'https://registry-1.docker.io';



// --- RegistryClient

function RegistryClient(opts) {
    assert.optionalObject(opts, 'opts');
    opts = opts || {};
    assert.optionalString(opts.url, 'opts.url');
    assert.optionalObject(opts.log, 'opts.log');

    this.log = opts.log
        ? opts.log.child({
                component: 'registry-client',
                serializers: restify.bunyan.serializers
            })
        : bunyan.createLogger({
                name: 'registry-client',
                serializers: restify.bunyan.serializers
            });
    this.url = opts.url || REGISTRY_URL;

    // TODO add passing through other restify options: agent, userAgent, ...
    this.client = restify.createJsonClient({
        url: this.url,
        log: this.log
    });
}

/**
 * <https://docs.docker.com/reference/api/registry_api/#status>
 */
RegistryClient.prototype.getStatus = function getStatus(cb) {
    assert.func(cb, 'cb');

    this.client.get({
        path: '/v1/_ping'
    }, function _afterGetStatus(err, req, res, obj) {
        if (err) {
            return cb(err);
        }
        return cb(null, obj, res);
    });
};



// --- RegistrySession
// AFAIK it could be useful to call `getStatus` on the registry endpoint
// setup via `createRegistrySession`, so we'll subclass `RegistryClient`
// to inherit those methods.

function RegistrySession(opts) {
    assert.object(opts, 'opts');
    assert.string(opts.token, 'opts.token');
    assert.string(opts.repo, 'opts.repo');

    this.repo = opts.repo;
    this.headers = {
        Authorization: 'Token ' + opts.token
    };

    RegistryClient.apply(this, opts);
}
util.inherits(RegistrySession, RegistryClient);



/**
 * <https://docs.docker.com/reference/api/registry_api/#list-repository-tags>
 */
RegistrySession.prototype.listRepoTags = function listRepoTags(cb) {
    assert.func(cb, 'cb');

    this.client.get({
        path: fmt('/v1/repositories/%s/tags', this.repo),
        headers: this.headers
    }, function _afterListRepoTags(err, req, res, obj) {
        if (err) {
            return cb(err);
        }
        return cb(null, obj);
    });
};


/**
 * Gets the image's ancestry: all of the image layers that are required for
 * it to be functional.
 */
RegistrySession.prototype.getImgAncestry = function getImgAncestry(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.imgId, 'opts.imgId');
    assert.func(cb, 'cb');

    this.client.get({
        path: fmt('/v1/images/%s/ancestry', opts.imgId),
        headers: this.headers
    }, function _afterGetImgAncestry(err, req, res, ancestry) {
        if (err) {
            return cb(err);
        }
        return cb(null, ancestry, res);
    });
};


/**
 * Gets the image's JSON (i.e. its metadata).
 * Though a poor name, IMHO, docker.git/registry/session.go calls it the image
 * "JSON".
 *
 * Note: There are two possibly interesting headers:
 *      X-Docker-Size: 456789
 *      X-Docker-Payload-Checksum:
 *       sha256:490b550231696db28fa98250b54bd0f635acc46c848a7698a1479a1232b31bd0
 *
 * The response is returned in the callback, so you can get those headers like
 * this:
 *
 *      sess.getImgJson({imgId: '...'}, function (err, imgJson, res) {
 *          console.log('size:', res.headers['x-docker-size']);
 *          console.log('checksum:', res.headers['x-docker-payload-checksum']);
 *      });
 */
RegistrySession.prototype.getImgJson = function getImgJson(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.imgId, 'opts.imgId');
    assert.func(cb, 'cb');

    this.client.get({
        path: fmt('/v1/images/%s/json', opts.imgId),
        headers: this.headers
    }, function _afterGetImgJson(err, req, res, imgJson) {
        if (err) {
            return cb(err);
        }
        cb(null, imgJson, res);
    });
};


// --- Exports

function createRegistryClient(opts) {
    return new RegistryClient(opts);
}

/**
 * Hit the Index API to get an auth token for the given repo, then create
 * a `RegistrySession` instance using that token.
 */
function createRegistrySession(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.repo, 'opts.repo');
    assert.optionalObject(opts.log, 'opts.log');
    assert.func(cb, 'cb');

    var idx = index_client.createIndexClient({log: opts.log});
    idx.getRepoAuth({repo: opts.repo}, function (err, repoAuth) {
        if (err) {
            cb(err);
        } else {
            var sess = new RegistrySession({
                token: repoAuth.token,
                // Randomize this at some point? For now the world only ever
                // returns one registry endpoint.
                url: repoAuth.registries[0],
                repo: opts.repo,
                log: opts.log
            });
            cb(null, sess);
        }
    });
}

module.exports = {
    createRegistryClient: createRegistryClient,
    createRegistrySession: createRegistrySession
};
