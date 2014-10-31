/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var assert = require('assert-plus');
var bunyan = require('bunyan');
var fmt = require('util').format;
var idxClient = require('./idx');
var restify = require('restify');
var VError = require('verror').VError;



// --- Globals



var REGISTRY_URL = 'https://registry-1.docker.io';



// --- Registry object



/**
 * Creates a new registry client
 */
function Registry(opts) {
    assert.object(opts, 'opts');
    assert.string(opts.repo, 'opts.repo');
    assert.string(opts.token, 'opts.token');
    assert.optionalObject(opts.log, 'opts.log');

    this.authHeader = 'Token ' + opts.token;
    this.log = opts.log || bunyan.createLogger({ name: 'registry' });
    this.repo = opts.repo;
    this.url = opts.url || REGISTRY_URL;
}


Registry.prototype.jsonClient = function jsonClient(opts) {
    return restify.createJsonClient({
        log: this.log,
        url: this.url
    });
};


/**
 * Gets the image's ancestry: all of the image layers that are required for
 * it to be functional
 */
Registry.prototype.getImageAncestry = function getImageAncestry(img, callback) {
    var client = this.jsonClient();
    client.get({
        path: fmt('/v1/images/%s/ancestry', img),
        headers: {
            Authorization: this.authHeader
        }
    }, function _afterImageAncestry(err, req, res, obj) {
        if (err) {
            return callback(err);
        }

        return callback(null, obj);
    });
};


/**
 * Gets the remote image's Metadata
 */
Registry.prototype.getImageMetadata =
    function getImageMetadata(img, callback) {
    var client = this.jsonClient();
    client.get({
        path: fmt('/v1/images/%s/json', img),
        headers: {
            Authorization: this.authHeader
        }
    }, function _afterRemoteImageJSON(err, req, res, obj) {
        if (err) {
            return callback(err);
        }

        return callback(null, obj);
    });
};


/**
 * Gets the remote image's JSON
 */
Registry.prototype.getRepoTags = function getRepoTags(callback) {
    var client = this.jsonClient();
    client.get({
        path: fmt('/v1/repositories/%s/tags', this.repo),
        headers: {
            Authorization: this.authHeader
        }
    }, function _afterRepoTags(err, req, res, obj) {
        if (err) {
            return callback(err);
        }

        return callback(null, obj);
    });
};



// --- Exports



/**
 * Create a new registry client.
 */
function createReg(opts) {
    return new Registry(opts);
}


/**
 * Create a new registry client that already has an auth token from the
 * docker index.
 */
function createWithToken(opts, callback) {
    assert.object(opts, 'opts');
    assert.string(opts.repo, 'opts.repo');
    assert.func(callback, 'callback');

    var idx = idxClient.create(opts);

    idx.getRepository(opts.repo, function (err, res) {
        if (err) {
            return callback(new VError(err,
                'Error getting repository from index'));
        }

        if (!res || !res.token) {
            return callback(new Error('No token returned from index'));
        }

        opts.token = res.token;
        return callback(null, new Registry(opts));
    });
}



module.exports = {
    create: createReg,
    createWithToken: createWithToken
};
