/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Docker Index API client. See the README for an intro.
 * <https://docs.docker.com/reference/api/docker-io_api/>
 * <https://docs.docker.com/reference/api/hub_registry_spec/>
 */

var assert = require('assert-plus');
var bunyan = require('bunyan');
var fmt = require('util').format;
var mod_url = require('url');
var restify = require('restify');



// --- Globals

var INDEX_URL = 'https://index.docker.io';



// --- IndexClient

function IndexClient(opts) {
    assert.optionalObject(opts, 'opts');
    opts = opts || {};
    assert.optionalString(opts.url, 'opts.url');
    assert.optionalObject(opts.log, 'opts.log');

    this.log = opts.log
        ? opts.log.child({
                component: 'index-client',
                serializers: restify.bunyan.serializers
            })
        : bunyan.createLogger({
                name: 'index-client',
                serializers: restify.bunyan.serializers
            });
    this.url = opts.url || INDEX_URL;

    // TODO add passing through other restify options: agent, userAgent, ...
    this.client = restify.createJsonClient({
        url: this.url,
        log: this.log
    });
}


/**
 * List images in the given repository.
 *
 * Note: This same endpoint is typically used to get a registry auth token and
 * endpoint URL. See the `getRepoAuth` method for sugar that handles this.
 */
IndexClient.prototype.listRepoImgs = function listRepoImgs(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.repo, 'opts.repo');
    assert.optionalObject(opts.headers, 'opts.headers');
    assert.func(cb, 'cb');

    this.client.get({
        path: fmt('/v1/repositories/%s/images', opts.repo),
        headers: opts.headers
    }, function _afterListRepoImgs(err, req, res, repoImgs) {
        if (err) {
            cb(err);
        } else {
            cb(null, repoImgs, res);
        }
    });
};


/**
 * Get repo auth to start a registry session.
 */
IndexClient.prototype.getRepoAuth = function getRepoAuth(opts, cb) {
    var self = this;
    assert.object(opts, 'opts');
    assert.string(opts.repo, 'opts.repo');
    assert.func(cb, 'cb');

    this.listRepoImgs({
        repo: opts.repo,
        headers: {
            'X-Docker-Token': true
        }
    }, function (err, repoImgs, res) {
        if (err) {
            cb(err);
        } else {
            var registries;
            if (res.headers['x-docker-endpoints'] !== undefined) {
                var proto = mod_url.parse(self.url).protocol;
                registries = res.headers['x-docker-endpoints'].split(/\s*,\s*/g)
                    .map(function (e) { return proto + '//' + e });
            }
            cb(null, {
                token: res.headers['x-docker-token'],
                registries: registries
            }, res);
        }
    });
};



// --- Exports

function createIndexClient(opts) {
    return new IndexClient(opts);
}

module.exports = {
    createIndexClient: createIndexClient
};
