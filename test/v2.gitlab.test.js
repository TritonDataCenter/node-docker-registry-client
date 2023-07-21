/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 * Copyright 2023 MNX Cloud, Inc.
 */

/*
 * Specifically we want to test a repo name with a '/'.
 * See <https://github.com/joyent/node-docker-registry-client/issues/16>.
 */

var crypto = require('crypto');
var path = require('path');
var test = require('tape');

var drc = require('..');


// --- globals

var log = require('./lib/log');

var REPO = 'registry.gitlab.com/masakura/'
    + 'docker-registry-client-bug-sample/image';
var TAG = 'hello-world';


// --- Helper functions.

function getFirstLayerDigestFromManifest(manifest_) {
    if (manifest_.schemaVersion === 1) {
        return manifest_.fsLayers[0].blobSum;
    }
    return manifest_.layers[0].digest;
}


// --- Tests

test('v2 registry.gitlab.com', function (tt) {
    var client;
    var repo = drc.parseRepo(REPO);

    tt.test('  createClient', function (t) {
        client = drc.createClientV2({
            name: REPO,
            log: log
        });
        t.ok(client);
        t.equal(client.version, 2);
        t.end();
    });

    tt.test('  ping', function (t) {
        client.ping(function (err, body, res) {
            t.ok(err);
            t.ok(res, 'have a response');
            if (res) {
                t.equal(res.statusCode, 401);
                t.ok(res.headers['www-authenticate']);
            }
            t.end();
        });
    });

    /*
     * Example expected output:
     *  {
     *      "name": "library/alpine",
     *      "tags": [ "2.6", "2.7", "3.1", "3.2", "edge", "latest" ]
     *  }
     */
    tt.test('  listTags', function (t) {
        client.listTags(function (err, tags) {
            t.ifErr(err);
            t.ok(tags);
            t.equal(tags.name, repo.remoteName);
            t.ok(tags.tags.indexOf(TAG) !== -1, 'have a "'+TAG+'" tag');
            t.end();
        });
    });

    /*
     *  {
     *      "name": <name>,
     *      "tag": <tag>,
     *      "fsLayers": [
     *         {
     *            "blobSum": <tarsum>
     *         },
     *         ...
     *      ],
     *      "history": <v1 images>,
     *      "signature": <JWS>
     *  }
     */
    tt.skip('  getManifest (v2.1)', function (t) {
        client.getManifest({ref: TAG}, function (err, manifest_, res) {
            t.ifErr(err);
            t.ok(manifest_);
            t.equal(manifest_.schemaVersion, 1);
            t.equal(manifest_.name, repo.remoteName);
            t.equal(manifest_.tag, TAG);
            t.ok(manifest_.architecture);
            t.ok(manifest_.fsLayers);
            t.ok(manifest_.history[0].v1Compatibility);
            t.ok(manifest_.signatures[0].signature);
            t.end();
        });
    });

    /*
     * {
     *   "schemaVersion": 2,
     *   "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
     *   "config": {
     *     "mediaType": "application/octet-stream",
     *     "size": 1459,
     *     "digest": "sha256:2b8fd9751c4c0f5dd266fc...01"
     *   },
     *   "layers": [
     *     {
     *       "mediaType": "application/vnd.docker.image.rootfs.diff.tar.gzip",
     *       "size": 667590,
     *       "digest": "sha256:8ddc19f16526912237dd8af...a9"
     *     }
     *   ]
     * }
     */
    var manifest;
    var manifestDigest;
    tt.test('  getManifest (v2.2)', function (t) {
        var getOpts = {ref: TAG, maxSchemaVersion: 2};
        client.getManifest(getOpts, function (err, manifest_, res) {
            t.ifErr(err);
            manifest = manifest_;
            manifestDigest = res.headers['docker-content-digest'];
            t.ok(manifest);
            t.equal(manifest.schemaVersion, 2);
            t.ok(manifest.config);
            t.ok(manifest.config.digest, manifest.config.digest);
            t.ok(manifest.layers);
            t.ok(manifest.layers.length > 0);
            t.ok(manifest.layers[0].digest);
            t.end();
        });
    });

    /*
     * Note this test requires that the manifest be pulled in the v2.2 format,
     * otherwise you will get a manifest not found error.
     */
    tt.test('  getManifest (by digest)', function (t) {
        var getOpts = {ref: manifestDigest, maxSchemaVersion: 2};
        client.getManifest(getOpts, function (err, manifest_) {
            t.ifErr(err);
            t.ok(manifest);
            ['schemaVersion',
             'config',
             'layers'].forEach(function (k) {
                t.deepEqual(manifest_[k], manifest[k], k);
            });
            t.end();
        });
    });

    tt.test('  getManifest (unknown tag)', function (t) {
        client.getManifest({ref: 'unknowntag'}, function (err, manifest_) {
            t.ok(err);
            t.notOk(manifest_);
            t.equal(err.statusCode, 404);
            t.end();
        });
    });

    tt.test('  getManifest (unknown repo)', function (t) {
        var badRepoClient = drc.createClientV2({
            maxSchemaVersion: 2,
            name: path.dirname(REPO) + '/unknownreponame',
            log: log
        });
        t.ok(badRepoClient);
        badRepoClient.getManifest({ref: 'latest'}, function (err, manifest_) {
            t.ok(err, 'Expected an error on a missing repo');
            t.notOk(manifest_);
            t.equal(err.statusCode, 404);
            badRepoClient.close();
            t.end();
        });
    });

    tt.test('  getManifest (bad username/password)', function (t) {
        var badUserClient = drc.createClientV2({
            maxSchemaVersion: 2,
            name: REPO,
            username: 'fredNoExistHere',
            password: 'fredForgot',
            log: log
        });
        t.ok(badUserClient);
        badUserClient.getManifest({ref: 'latest'}, function (err, manifest_) {
            t.ok(err, 'Expected an error on a missing repo');
            t.notOk(manifest_);
            t.equal(err.statusCode, 401);
            badUserClient.close();
            t.end();
        });
    });

    tt.test('  headBlob', function (t) {
        var digest = getFirstLayerDigestFromManifest(manifest);
        client.headBlob({digest: digest}, function (err, ress) {
            t.ifErr(err, 'no headBlob err');
            t.ok(ress, 'got a "ress"');
            t.ok(Array.isArray(ress), '"ress" is an array');
            var first = ress[0];
            t.ok(first.statusCode === 200 || first.statusCode === 307,
                'first response statusCode is 200 or 307');
            if (first.headers['docker-content-digest']) {
                t.equal(first.headers['docker-content-digest'], digest,
                    '"docker-content-digest" header from first response is '
                    + 'the queried digest');
            }
            t.equal(first.headers['docker-distribution-api-version'],
                'registry/2.0',
                '"docker-distribution-api-version" header is "registry/2.0"');
            var last = ress[ress.length - 1];
            t.equal(last.statusCode, 200, 'last response statusCode is 200');
            var contentType = last.headers['content-type'];
            t.ok(['application/octet-stream', 'application/x-gzip']
                .indexOf(contentType) !== -1,
                'content-type is as expected, got ' + contentType);
            t.ok(last.headers['content-length']);
            t.end();
        });
    });

    tt.test('  headBlob (unknown digest)', function (t) {
        client.headBlob({digest: 'cafebabe'}, function (err, ress) {
            t.ok(err);
            t.ok(ress);
            t.ok(Array.isArray(ress));
            t.equal(ress.length, 1);
            var res = ress[0];
            t.equal(res.statusCode, 404);
            t.skip(res.headers['docker-distribution-api-version'],
                'registry/2.0');
            t.end();
        });
    });

    tt.test('  createBlobReadStream', function (t) {
        var digest = getFirstLayerDigestFromManifest(manifest);
        client.createBlobReadStream({digest: digest},
                function (err, stream, ress) {
            t.ifErr(err, 'createBlobReadStream err');

            t.ok(ress, 'got responses');
            t.ok(Array.isArray(ress), 'ress is an array');
            var first = ress[0];
            t.ok(first.statusCode === 200 || first.statusCode === 307,
                'createBlobReadStream first res statusCode is 200 or 307');
            if (first.headers['docker-content-digest']) {
                t.equal(first.headers['docker-content-digest'], digest,
                    '"docker-content-digest" header from first response is '
                    + 'the queried digest');
            }
            t.equal(first.headers['docker-distribution-api-version'],
                'registry/2.0',
                '"docker-distribution-api-version" header is "registry/2.0"');

            t.ok(stream, 'got a stream');
            t.equal(stream.statusCode, 200, 'stream statusCode is 200');
            t.equal(stream.headers['content-type'], 'application/octet-stream');
            t.ok(stream.headers['content-length'] !== undefined,
                'got a "content-length" header');

            var numBytes = 0;
            var hash = crypto.createHash(digest.split(':')[0]);
            stream.on('data', function (chunk) {
                hash.update(chunk);
                numBytes += chunk.length;
            });
            stream.on('end', function () {
                t.equal(hash.digest('hex'), digest.split(':')[1]);
                t.equal(numBytes, Number(stream.headers['content-length']));
                t.end();
            });
            stream.resume();
        });
    });

    tt.skip('  createBlobReadStream (unknown digest)', function (t) {
        client.createBlobReadStream({digest: 'cafebabe'},
                function (err, stream, ress) {
            t.ok(err);
            t.ok(ress);
            t.ok(Array.isArray(ress));
            t.equal(ress.length, 1);
            var res = ress[0];
            t.equal(res.statusCode, 404);
            t.equal(res.headers['docker-distribution-api-version'],
                'registry/2.0');
            t.end();
        });
    });

    tt.test('  close', function (t) {
        client.close();
        t.end();
    });
});
