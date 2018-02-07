/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/*
 * Test Docker v2 Registry in a jfrog artifactory repo, if there is a local
 * config with repo details.
 *
 * This requires a test/config.json something like this:
 *
 *      {
 *          "v2jfrogartifactory": {
 *              "repo": "trentm.artifactoryonline.com/busybox",
 *              "username": "admin",
 *              "password": "(your password)",
 *              "tag": "latest"
 *          }
 *      }
 *
 * See DOCKER-419 for details on how to setup a Docker registry with
 * a demo account of jfrog artifactory.
 * <https://www.jfrog.com/artifactory/free-trial/>
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
    CONFIG = require(__dirname + '/config.json').v2jfrogartifactory;
    assert.object(CONFIG, 'config.json#v2jfrogartifactory');
    assert.string(CONFIG.repo, 'CONFIG.repo');
    assert.string(CONFIG.tag, 'CONFIG.tag');
    assert.string(CONFIG.username, 'CONFIG.username');
    assert.string(CONFIG.password, 'CONFIG.password');
} catch (e) {
    CONFIG = null;
    log.warn(e, 'skipping v2 jfrog artifactory tests: ' +
        'could not load "v2jfrogartifactory" key from test/config.json');
    console.warn('# warning: skipping v2 jfrog artifactory tests: %s',
        e.message);
}


// --- Tests

if (CONFIG)
test('v2 jfrog artifactory private repo (' + CONFIG.repo + ')', function (tt) {
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

    tt.test('  supportsV2', function (t) {
        client.supportsV2(function (err, supportsV2) {
            t.ifErr(err);
            t.ok(supportsV2, 'supportsV2');
            t.end();
        });
    });

    tt.test('  ping', function (t) {
        client.ping(function (err, body, res) {
            // Expect a 401 (Not Authorized) error here.
            t.ok(err);
            t.ok(res, 'have a response');
            if (res) {
                t.equal(res.statusCode, 401);
                t.equal(res.headers['docker-distribution-api-version'],
                    'registry/2.0');
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
    tt.test('  getManifest', function (t) {
        client.getManifest({ref: CONFIG.tag}, function (err, manifest_, res) {
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

    tt.test('  getManifest (by digest)', function (t) {
        client.getManifest({ref: manifestDigest}, function (err, manifest_) {
            t.ifErr(err);
            t.ok(manifest);
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
            t.ok(ress);
            t.ok(Array.isArray(ress));
            var first = ress[0];
            t.ok(first.statusCode === 200 || first.statusCode === 307);
            t.equal(first.headers['docker-content-digest'], digest);
            t.equal(first.headers['docker-distribution-api-version'],
               'registry/2.0');

            var last = ress[ress.length - 1];
            t.ok(last);
            t.equal(last.statusCode, 200);
            t.equal(last.headers['content-type'],
                'application/octet-stream');

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

            // statusCode: docker.io gives 404, which is what I'd expect
            //
            // The spec doesn't specify:
            // https://docs.docker.com/registry/spec/api/#existing-layers
            t.equal(res.statusCode, 404);

            // Docker-Distribution-Api-Version header:
            // docker.io includes this header here, artifactory does not.
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
            // - quay.io gives 302 (Found)
            // - docker.io gives 307
            t.ok([200, 302, 307].indexOf(first.statusCode) !== -1,
                'first request status code 200, 302 or 307: statusCode=' +
                first.statusCode);
            t.equal(first.headers['docker-content-digest'], digest);
            t.equal(first.headers['docker-distribution-api-version'],
               'registry/2.0');

            t.ok(stream);
            t.equal(stream.statusCode, 200);

            t.equal(stream.headers['content-type'],
                'application/octet-stream');

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
            //
            // The spec doesn't specify:
            // https://docs.docker.com/registry/spec/api/#existing-layers
            t.equal(res.statusCode, 404);

            // Docker-Distribution-Api-Version header:
            // docker.io includes this header here, artifactory does not.
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
