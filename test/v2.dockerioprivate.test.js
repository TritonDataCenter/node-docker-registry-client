/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/*
 * Test Docker Hub with a private repo.
 *
 * This requires a test/config.json something like this:
 *
 *      {
 *          "dockerioprivate": {
 *              "repo": "trentm/my-priv-repo
 *              "username": "trentm",
 *              "password": "(your password)",
 *              "tag": "latest"
 *          }
 *      }
 */

var assert = require('assert-plus');
var crypto = require('crypto');
var strsplit = require('strsplit');
var test = require('tape');

var drc = require('..');


// --- globals

var log = require('./lib/log');

var CONFIG;
try {
    CONFIG = require(__dirname + '/config.json').dockerioprivate;
    assert.object(CONFIG, 'config.json#dockerioprivate');
    assert.string(CONFIG.repo, 'CONFIG.repo');
    assert.string(CONFIG.tag, 'CONFIG.tag');
    assert.string(CONFIG.username, 'CONFIG.username');
    assert.string(CONFIG.password, 'CONFIG.password');
} catch (e) {
    CONFIG = null;
    log.warn(e, 'skipping Docker Hub private repo tests: ' +
        'could not load "dockerioprivate" key from test/config.json');
    console.warn('# warning: skipping Docker Hub private repo tests: %s',
        e.message);
}



// --- Tests

if (CONFIG)
test('v2 docker.io private repo (' + CONFIG.repo + ')', function (tt) {
    var client;
    var repo = drc.parseRepo(CONFIG.repo);

    tt.test('  createClient', function (t) {
        client = drc.createClientV2({
            maxSchemaVersion: 2,
            name: CONFIG.repo,
            username: CONFIG.username,
            password: CONFIG.password,
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
            t.ok(tags.tags.indexOf(CONFIG.tag) !== -1,
                'no "'+CONFIG.tag+'" tag');
            t.end();
        });
    });

    /*
     * IMGAPI's docker pull will attempt to figure out if a registry is
     * private, i.e. *requires auth*. It'll do that by trying to get starter
     * info *without* auth info. Ensure that doesn't blow up.
     */
    var noAuthClient;
    tt.test('  noAuthClient: setup', function (t) {
        noAuthClient = drc.createClientV2({
            name: CONFIG.repo,
            maxSchemaVersion: 2,
            log: log
        });
        t.ok(noAuthClient);
        t.end();
    });
    tt.test('  noAuthClient: ping', function (t) {
        noAuthClient.ping(function (err, body, res) {
            t.ok(err, 'expect an auth error');
            t.ok(res, 'have a response');
            if (res) {
                t.equal(res.statusCode, 401);
                t.ok(res.headers['www-authenticate']);
                t.equal(res.headers['docker-distribution-api-version'],
                    'registry/2.0');
            }
            t.end();
        });
    });
    tt.test('  noAuthClient: getManifest', function (t) {
        noAuthClient.getManifest({ref: CONFIG.tag},
                function (err, manifest_, res) {
            t.ok(err, 'expect an auth error');
            t.end();
        });
    });
    tt.test('  noAuthClient: close', function (t) {
        noAuthClient.close();
        t.end();
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
    var manifestStr;
    tt.test('  getManifest', function (t) {
        client.getManifest({ref: CONFIG.tag},
                function (err, manifest_, res, manifestStr_) {
            t.ifErr(err);
            manifest = manifest_;
            manifestDigest = res.headers['docker-content-digest'];
            manifestStr = manifestStr_;
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

    // Note: The manifestDigest returned above is for a v2.2 manifest (i.e. it
    // was originally pushed as a v2.2 manifest), so requesting this digest via
    // the v2.1 API will fail, as the digest will not match up!
    tt.test('  getManifest (v2.1 by digest)', function (t) {
        client.getManifest({ref: manifestDigest}, function (err, manifest_) {
            t.ok(err, 'expect an err');
            t.notOk(manifest_);
            t.equal(err.statusCode, 404);
            t.end();
        });
    });

    var v2Manifest;
    var v2ManifestDigest;
    tt.test('  getManifest (v2.2)', function (t) {
        var getOpts = {ref: CONFIG.tag, maxSchemaVersion: 2};
        client.getManifest(getOpts, function (err, manifest_, res) {
            t.ifErr(err);
            v2Manifest = manifest_;
            v2ManifestDigest = res.headers['docker-content-digest'];
            t.ok(v2Manifest);
            t.equal(v2Manifest.schemaVersion, 2);
            t.ok(v2Manifest.config);
            t.ok(v2Manifest.config.digest);
            t.ok(v2Manifest.layers);
            t.ok(v2Manifest.layers.length > 0);
            t.ok(v2Manifest.layers[0].digest);
            t.end();
        });
    });

    tt.test('  getManifest (v2.2 by digest)', function (t) {
        var opts = {
            maxSchemaVersion: 2,
            ref: v2ManifestDigest
        };
        client.getManifest(opts, function (err, manifest_) {
            t.ifErr(err);
            t.ok(manifest_);
            t.equal(manifest_.schemaVersion, 2);
            t.ok(manifest_.config);
            t.ok(manifest_.config.digest);
            t.ok(manifest_.layers);
            t.ok(manifest_.layers.length > 0);
            t.ok(manifest_.layers[0].digest);
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

    tt.test('  headBlob', function (t) {
        var digest = manifest.layers[0].digest;
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
            t.equal(res.headers['docker-distribution-api-version'],
                'registry/2.0');
            t.end();
        });
    });

    tt.test('  createBlobReadStream', function (t) {
        var digest = manifest.layers[0].digest;
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

    tt.test('  createBlobReadStream (unknown digest)', function (t) {
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

    tt.test('  blobUpload', function (t) {
        var digest = manifest.layers[0].digest;
        client.createBlobReadStream({digest: digest},
                function (err, stream, ress) {
            t.ifErr(err, 'createBlobReadStream err');

            var last = ress[ress.length - 1];
            var uploadOpts = {
                contentLength: parseInt(last.headers['content-length'], 10),
                digest: digest,
                stream: stream
            };
            client.blobUpload(uploadOpts, function _uploadCb(uploadErr, res) {
                t.ifErr(uploadErr, 'check blobUpload err');
                t.equal(res.headers['docker-content-digest'], digest,
                    'Response header digest should match blob digest');
                t.end();
            });
        });
    });

    tt.test('  putManifest', function (t) {
        var uploadOpts = {
            contentLength: manifestStr.length,
            manifest: manifestStr,
            ref: 'test_put_manifest'
        };
        client.putManifest(uploadOpts, function _uploadCb(uploadErr, res) {
            t.ifErr(uploadErr, 'check blobUpload err');
            t.equal(res.headers['docker-content-digest'], manifestDigest,
                'Response header digest should match manifest digest');
            t.end();
        });
    });

    tt.test('  close', function (t) {
        client.close();
        t.end();
    });
});
