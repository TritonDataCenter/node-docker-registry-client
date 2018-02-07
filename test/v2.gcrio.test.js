/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

var crypto = require('crypto');
var test = require('tape');
var util = require('util');

var drc = require('..');


// --- globals

var format = util.format;
var log = require('./lib/log');

var REPO = 'gcr.io/google_containers/pause';
var TAG = 'latest';

// --- Tests

test('v2 gcr.io', function (tt) {
    var client;
    var repo = drc.parseRepo(REPO);

    tt.test('  createClient', function (t) {
        client = drc.createClientV2({
            maxSchemaVersion: 2,
            name: REPO,
            log: log
        });
        t.ok(client);
        t.equal(client.version, 2);
        t.end();
    });

    tt.test('  supportsV2', function (t) {
        client.supportsV2(function (err, supportsV2) {
            t.ifErr(err);
            t.ok(supportsV2, 'supportsV2');
            t.end();
        });
    });

    tt.test('  ping', function (t) {
        client.ping(function (err, body, res) {
            t.ok(err);
            t.ok(res, 'have a response');
            if (res) {
                t.equal(res.statusCode, 401);
                t.ok(res.headers['www-authenticate']);
            }
            t.equal(res.headers['docker-distribution-api-version'],
                'registry/2.0');
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
            t.ok(tags.tags.indexOf(TAG) !== -1, 'no "'+TAG+'" tag');
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
    tt.test('  getManifest', function (t) {
        client.getManifest({ref: TAG}, function (err, manifest_, res) {
            t.ifErr(err);
            manifest = manifest_;
            manifestDigest = res.headers['docker-content-digest'];
            t.ok(manifest);
            t.ok(manifestDigest, 'check for manifest digest header');
            t.equal(manifest.schemaVersion, 2);
            t.ok(manifest.config);
            t.ok(manifest.config.digest, manifest.config.digest);
            t.ok(manifest.layers);
            t.ok(manifest.layers.length > 0);
            t.ok(manifest.layers[0].digest);
            t.end();
        });
    });

    tt.test('  getManifest (by digest)', function (t) {
        client.getManifest({ref: manifestDigest}, function (err, manifest_) {
            t.ifErr(err);
            t.ok(manifest_);
            ['schemaVersion',
             'name',
             'tag',
             'architecture'].forEach(function (k) {
                t.equal(manifest_[k], manifest[k], k);
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
            name: 'unknownreponame',
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
        var digest = manifest.layers[0].digest;
        client.headBlob({digest: digest}, function (err, ress) {
            t.ifErr(err);
            t.ok(ress, 'got responses');
            t.ok(Array.isArray(ress), 'responses is an array');
            var first = ress[0];

            // First request statusCode on a redirect:
            // - gcr.io gives 302 (Found)
            // - docker.io gives 307
            t.ok([200, 302, 303, 307].indexOf(first.statusCode) !== -1,
                'first response status code 200, 302 or 307: statusCode=' +
                first.statusCode);

            // No digest head is returned (it's using an earlier version of the
            // registry API).
            if (first.headers['docker-content-digest']) {
                t.equal(first.headers['docker-content-digest'], digest);
            }

            t.equal(first.headers['docker-distribution-api-version'],
                'registry/2.0');

            var last = ress[ress.length - 1];
            t.ok(last);
            t.equal(last.statusCode, 200,
                'last response status code should be 200');

            // Content-Type:
            // - docker.io gives 'application/octet-stream', which is what
            //   I'd expect for the GET response at least.
            // - However gcr.io, at least for the iamge being tested, now
            //   returns text/html.
            t.equal(last.headers['content-type'],
                'text/html',
                format('expect specific Content-Type on last response; '
                    + 'statusCode=%s headers=%j',
                    last.statusCode, last.headers));

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
            // var res = ress[0];

            // statusCode:
            // - docker.io gives 404, which is what I'd expect
            // - gcr.io gives 405 (Method Not Allowed). Hrm.
            // The spec doesn't specify:
            // https://docs.docker.com/registry/spec/api/#existing-layers
            // t.equal(res.statusCode, 404);

            // Docker-Distribution-Api-Version header:
            // docker.io includes this header here, gcr.io does not.
            // t.equal(res.headers['docker-distribution-api-version'],
            //    'registry/2.0');

            t.end();
        });
    });

    tt.test('  createBlobReadStream', function (t) {
        var digest = manifest.layers[0].digest;
        client.createBlobReadStream({digest: digest},
                function (err, stream, ress) {
            t.ifErr(err);

            t.ok(ress);
            t.ok(Array.isArray(ress));
            var first = ress[0];
            // First request statusCode on a redirect:
            // - gcr.io gives 302 (Found)
            // - docker.io gives 307
            t.ok([200, 302, 307].indexOf(first.statusCode) !== -1,
                'first request status code 200, 302 or 307: statusCode=' +
                first.statusCode);

            // No digest head is returned (it's using an earlier version of the
            // registry API).
            if (first.headers['docker-content-digest']) {
                t.equal(first.headers['docker-content-digest'], digest);
            }

            t.equal(first.headers['docker-distribution-api-version'],
                'registry/2.0');

            t.ok(stream);
            t.equal(stream.statusCode, 200);
            // Content-Type:
            // - docker.io gives 'application/octet-stream', which is what
            //   I'd expect for the GET response at least.
            // - However gcr.io, at least for the iamge being tested, now
            //   returns text/html.
            t.equal(stream.headers['content-type'],
                'text/html',
                format('expect specific Content-Type on stream response; '
                    + 'statusCode=%s headers=%j',
                    stream.statusCode, stream.headers));
            t.ok(stream.headers['content-length']);

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

    tt.test('  createBlobReadStream (unknown digest)', function (t) {
        client.createBlobReadStream({digest: 'cafebabe'},
                function (err, stream, ress) {
            t.ok(err);
            t.ok(ress);
            t.ok(Array.isArray(ress));
            t.equal(ress.length, 1);
            // var res = ress[0];

            // statusCode:
            // - docker.io gives 404, which is what I'd expect
            // - gcr.io gives 405 (Method Not Allowed). Hrm.
            // The spec doesn't specify:
            // https://docs.docker.com/registry/spec/api/#existing-layers
            // t.equal(res.statusCode, 404);

            // Docker-Distribution-Api-Version header:
            // docker.io includes this header here, gcr.io does not.
            // t.equal(res.headers['docker-distribution-api-version'],
            //    'registry/2.0');

            t.end();
        });
    });

    tt.test('  close', function (t) {
        client.close();
        t.end();
    });
});
