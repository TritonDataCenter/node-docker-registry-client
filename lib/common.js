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
var strsplit = require('strsplit');



// --- globals

// See `INDEXNAME` in docker/docker.git:registry/config.go.
var DEFAULT_INDEX_NAME = 'docker.io';

// JSSTYLED
// 'DEFAULTTAG' from https://github.com/docker/docker/blob/0c7b51089c8cd7ef3510a9b40edaa139a7ca91aa/graph/tags.go#L25
var DEFAULT_TAG = 'latest';

var VALID_NS = /^[a-z0-9_-]*$/;
var VALID_REPO = /^[a-z0-9_\.-]*$/;



// --- exports

function objMerge(a, b) {
    assert.object(a, 'a');
    assert.object(b, 'b');
    Object.keys(b).forEach(function (key) {
        a[key] = b[key];
    });
    return a;
}


/**
 * Parse a docker repo and tag string: [INDEX/]REPO[:TAG|@DIGEST]
 *
 * Examples:
 *    busybox
 *    google/python
 *    docker.io/ubuntu
 *    localhost:5000/blarg
 *
 * The namespace (`ns` field) defaults to "library" if not given.
 * The tag (`tag` field) defaults to "latest" if not given.
 *
 * Dev Notes:
 * - This is meant to mimic
 *   docker.git:registry/config.go#ServiceConfig.NewRepositoryInfo
 *   as much as reasonable -- with the addition that we maintain the
 *   'tag' field.
 * - TODO: what about the '@digest' digest alternative to a tag? See:
 *   // JSSTYLED
 *   https://github.com/docker/docker/blob/0c7b51089c8cd7ef3510a9b40edaa139a7ca91aa/pkg/parsers/parsers.go#L68
 */
function parseRepo(arg) {
    if (arg.indexOf('://') !== -1) {
        throw new Error('invalid repository name, cannot include a ' +
            'protocol schema:' + arg);
    }

    var info = {};

    // Optional leading `INDEX/`.
    var remoteName;
    var parts = strsplit(arg, '/', 2);
    if (parts.length === 1 || (
        /* or if parts[0] doesn't look like a hostname or IP */
        parts[0].indexOf('.') === -1 &&
        parts[0].indexOf(':') === -1 &&
        parts[0] !== 'localhost'))
    {
        info.index = {
            name: DEFAULT_INDEX_NAME,
            official: true
        };
        remoteName = arg;
    } else {
        // Per docker `ValidateIndexName`.
        var indexName = parts[0];
        if (indexName === 'index.' + DEFAULT_INDEX_NAME) {
            indexName = DEFAULT_INDEX_NAME;
        }

        info.index = {
            name: indexName,
            official: Boolean(indexName === DEFAULT_INDEX_NAME)
        };
        remoteName = parts[1];
    }

    // Validate remoteName (docker `validateRemoteName`).
    var nameParts = strsplit(remoteName, '/', 2);
    var ns, name;
    if (nameParts.length === 2) {
        name = nameParts[1];

        // Validate ns.
        ns = nameParts[0];
        if (ns.length < 2 || ns.length > 255) {
            throw new Error('invalid repository namespace, must be between ' +
                '2 and 255 characters: ' + ns);
        }
        if (! VALID_NS.test(ns)) {
            throw new Error('invalid repository namespace, may only contain ' +
                '[a-z0-9_-] characters: ' + ns);
        }
        if (ns[0] === '-' && ns[ns.length - 1] === '-') {
            throw new Error('invalid repository namespace, cannot start or ' +
                'end with a hypen: ' + ns);
        }
        if (ns.indexOf('--') !== -1) {
            throw new Error('invalid repository namespace, cannot contain ' +
                'consecutive hyphens: ' + ns);
        }
    } else {
        name = remoteName;
        if (info.index.official) {
            ns = 'library';
        }
    }

    // Validate name.
    if (! VALID_REPO.test(name)) {
        throw new Error('invalid repository name, may only contain ' +
            '[a-z0-9_.-] characters: ' + name);
    }


    info.official = false;
    if (info.index.official) {
        info.remoteName = ns + '/' + name;
        if (ns === 'library') {
            info.official = true;
            info.localName = name;
        } else {
            info.localName = info.remoteName;
        }
        info.canonicalName = DEFAULT_INDEX_NAME + '/' + info.localName;
    } else {
        if (ns) {
            info.remoteName = ns + '/' + name;
        } else {
            info.remoteName = name;
        }
        info.localName = info.index.name + '/' + info.remoteName;
        info.canonicalName = info.localName;
    }

    return info;
}


/*
 *
 * Dev Notes:
 * - Validation on digest and tag would be nice.
 */
function parseRepoAndTag(arg) {
    // Parse off the tag/digest per
    // JSSTYLED
    // https://github.com/docker/docker/blob/0c7b51089c8cd7ef3510a9b40edaa139a7ca91aa/pkg/parsers/parsers.go#L69
    var repo, tag, digest;
    var atIdx = arg.lastIndexOf('@');
    if (atIdx !== -1) {
        repo = arg.slice(0, atIdx);
        digest = arg.slice(atIdx + 1);
    } else {
        var colonIdx = arg.lastIndexOf(':');
        var slashIdx = arg.lastIndexOf('/');
        if (colonIdx !== -1 && colonIdx > slashIdx) {
            repo = arg.slice(0, colonIdx);
            tag = arg.slice(colonIdx + 1);
        } else {
            repo = arg;
        }
    }

    var info = parseRepo(repo);
    if (digest) {
        info.digest = digest;
    } else if (tag) {
        info.tag = tag;
    } else {
        info.tag = DEFAULT_TAG;
    }

    return info;
}


module.exports = {
    DEFAULT_INDEX_NAME: DEFAULT_INDEX_NAME,
    DEFAULT_TAG: DEFAULT_TAG,
    parseRepo: parseRepo,
    parseRepoAndTag: parseRepoAndTag,

    objMerge: objMerge
};
