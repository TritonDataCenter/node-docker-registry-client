/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

var assert = require('assert-plus');
var crypto = require('crypto');
var path = require('path');
var test = require('tape');

var drc = require('..');


// --- globals

var log = require('./lib/log');

var CONFIG;
try {
    CONFIG = require(__dirname + '/config.json').amazonecr;
    assert.object(CONFIG, 'config.json#amazonecr');
    assert.string(CONFIG.repo, 'CONFIG.repo');
    assert.string(CONFIG.tag, 'CONFIG.tag');
    assert.string(CONFIG.username, 'CONFIG.username');
    assert.string(CONFIG.password, 'CONFIG.password');
} catch (e) {
    CONFIG = null;
    log.warn(e, 'skipping Amazon ECR repo tests: ' +
        'could not load "amazonecr" key from test/config.json');
    console.warn('# warning: skipping Amazon ECR private repo tests: %s',
        e.message);
}

var ECR_REGISTRY_VERSION = 'registry/2.0';

// --- Tests

if (CONFIG)
test('v2 amazonecr', function (tt) {
    var client;
    var noauthClient;
    var repo = drc.parseRepo(CONFIG.repo);

    tt.test('  createClient', function (t) {
        noauthClient = drc.createClientV2({
            name: CONFIG.repo,
            maxSchemaVersion: 2,
            log: log
        });
        t.ok(noauthClient);
        t.equal(noauthClient.version, 2);
        t.end();
    });

    tt.test('  supportsV2', function (t) {
        noauthClient.supportsV2(function (err, supportsV2) {
            t.ifErr(err);
            t.ok(supportsV2, 'supportsV2');
            t.end();
        });
    });

    tt.test('  ping', function (t) {
        noauthClient.ping(function (err, body, res) {
            t.ok(err);
            t.ok(res, 'have a response');
            if (res) {
                t.equal(res.statusCode, 401);
                t.ok(res.headers['www-authenticate']);
            }
            t.equal(res.headers['docker-distribution-api-version'],
                ECR_REGISTRY_VERSION);
            t.end();
        });
    });

    /*
     * Test that we need to be logged in to list repo tags.
     */
    tt.test('  listTags (no auth)', function (t) {
        noauthClient.listTags(function (err) {
            t.ok(err);
            t.equal(err.statusCode, 401, 'Expect a 401 status code');
            t.equal(String(err.message).trim(), 'Not Authorized');
            t.end();
        });
    });

    /*
     * Login using auth.
     */
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
                'no "' + CONFIG.tag + '" tag');
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
    var manifestStr;
    tt.test('  getManifest', function (t) {
        client.getManifest({ref: CONFIG.tag},
                function (err, manifest_, res, manifestStr_) {
            t.ifErr(err);
            manifest = manifest_;
            manifestStr = manifestStr_;
            // Note that Amazon ECR does not return a docker-content-digest
            // header.
            var manifestDigest = res.headers['docker-content-digest'];
            t.equal(manifestDigest, undefined, 'no docker-content-digest');
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
            name: path.dirname(CONFIG.repo) + '/unknownreponame',
            username: CONFIG.username,
            password: CONFIG.password,
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
            name: CONFIG.repo,
            username: 'AWS',
            password: 'IForgot',
            log: log
        });
        t.ok(badUserClient);
        badUserClient.getManifest({ref: 'latest'}, function (err, manifest_) {
            t.ok(err, 'Expected an error on a missing repo');
            t.notOk(manifest_);
            // Amazon is different in this case - it gives a 400 error, whilst
            // other registries return a 401 error:
            // {"errors":[{
            //      "code": "DENIED",
            //      "message": "Your Authorization Token is invalid."
            // }]}
            t.equal(err.statusCode, 400);
            badUserClient.close();
            t.end();
        });
    });

    tt.test('  headBlob', function (t) {
        var digest = manifest.layers[0].digest;
        client.headBlob({digest: digest}, function (err, ress) {
            t.ifErr(err);
            t.ok(ress);
            t.ok(Array.isArray(ress));
            var first = ress[0];

            // First request statusCode on a redirect:
            // - ecr.amazonaws.com gives 302 (Found)
            // - docker.io gives 307
            t.ok([200, 302, 303, 307].indexOf(first.statusCode) !== -1,
                'first request status code 200, 302 or 307: statusCode=' +
                first.statusCode);

            // No digest head is returned (it's using an earlier version of the
            // registry API).
            if (first.headers['docker-content-digest']) {
                t.equal(first.headers['docker-content-digest'], digest);
            }

            t.equal(first.headers['docker-distribution-api-version'],
                ECR_REGISTRY_VERSION);

            var last = ress[ress.length - 1];
            t.ok(last);
            t.equal(last.statusCode, 200);

            // Content-Type:
            // - Note that docker.io gives 'application/octet-stream'
            t.equal(last.headers['content-type'],
                'application/vnd.docker.image.rootfs.diff.tar.gzip');
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

            // statusCode:
            // - docker.io gives 404, which is what I'd expect
            // - ecr.amazonaws.com gives 405 (Method Not Allowed). Hrm.
            // The spec doesn't specify:
            // https://docs.docker.com/registry/spec/api/#existing-layers
            // t.equal(res.statusCode, 404);

            t.equal(res.headers['docker-distribution-api-version'],
                ECR_REGISTRY_VERSION);

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
            // - ecr.amazonaws.com gives 302 (Found)
            // - docker.io gives 307
            t.ok([200, 302, 307].indexOf(first.statusCode) !== -1,
                'first request status code 200, 302 or 307: statusCode=' +
                first.statusCode);

            // No digest head is returned (it's using an earlier version of the
            // registry API).
            if (first.headers['docker-content-digest']) {
                t.equal(first.headers['docker-content-digest'], digest);
            }

            // Docker-Distribution-Api-Version header:
            t.equal(first.headers['docker-distribution-api-version'],
                ECR_REGISTRY_VERSION);

            t.ok(stream);
            t.equal(stream.statusCode, 200);
            t.equal(stream.headers['content-type'], 'application/octet-stream');
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

            var res = ress[0];

            // statusCode:
            // - docker.io gives 404, which is what I'd expect
            // - ecr.amazonaws.com gives 405 (Method Not Allowed). Hrm.
            // The spec doesn't specify:
            // https://docs.docker.com/registry/spec/api/#existing-layers
            // t.equal(res.statusCode, 404);

            t.equal(res.headers['docker-distribution-api-version'],
                ECR_REGISTRY_VERSION);

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
        // Calculate the existing manifest digest.
        var manifestDigest = 'sha256:' + crypto.createHash('sha256')
            .update(manifestStr, 'binary')
            .digest('hex');

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
