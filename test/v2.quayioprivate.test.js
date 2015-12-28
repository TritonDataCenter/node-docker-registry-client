/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Test quay.io with a private repo.
 *
 * This requires a test/config.json something like this:
 *
 *      {
 *          "quayioprivate": {
 *              "repo": "quay.io/trentm/my-priv-repo
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
    CONFIG = require(__dirname + '/config.json').quayioprivate;
    assert.object(CONFIG, 'config.json#quayioprivate');
} catch (e) {
    CONFIG = null;
    log.warn(e, 'skipping Quay.io private repo tests: ' +
        'could not load "quayioprivate" key from test/config.json');
    console.warn('# warning: skipping Quay.io private repo tests: %s',
        e.message);
}
if (CONFIG) {
    assert.string(CONFIG.repo, 'CONFIG.repo');
    assert.string(CONFIG.tag, 'CONFIG.tag');
    assert.string(CONFIG.username, 'CONFIG.username');
    assert.string(CONFIG.password, 'CONFIG.password');
    assert.ok(/^quay.io\//.test(CONFIG.repo),
        'CONFIG.repo starts with "quay.io/": ' + CONFIG.repo);
}


// Trent will report these to "support@quay.io" and jzelinskie on #quay IRC
var SKIP_QUAY_IO_BUGLETS = true;


// --- Tests

if (CONFIG)
test('v2 quay.io private repo (' + CONFIG.repo + ')', function (tt) {
    var client;
    var repo = drc.parseRepo(CONFIG.repo);

    tt.test('  createClient', function (t) {
        client = drc.createClientV2({
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
    var manifest;
    var manifestDigest;
    tt.test('  getManifest', function (t) {
        client.getManifest({ref: CONFIG.tag}, function (err, manifest_, res) {
            t.ifErr(err);
            manifest = manifest_;
            manifestDigest = res.headers['docker-content-digest'];
            t.ok(manifest);
            t.equal(manifest.schemaVersion, 1);
            t.equal(manifest.name, repo.remoteName);
            t.equal(manifest.tag, CONFIG.tag);
            t.ok(manifest.architecture);
            t.ok(manifest.fsLayers);
            t.ok(manifest.history[0].v1Compatibility);
            t.ok(manifest.signatures[0].signature);
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

    tt.test('  headBlob', function (t) {
        var digest = manifest.fsLayers[0].blobSum;
        client.headBlob({digest: digest}, function (err, ress) {
            t.ifErr(err);
            t.ok(ress);
            t.ok(Array.isArray(ress));
            var first = ress[0];
            t.ok(first.statusCode === 200 || first.statusCode === 307);
            t.equal(first.headers['docker-content-digest'], digest);

            // Docker-Distribution-Api-Version header:
            // docker.io includes this header here, quay.io does not.
            // t.equal(first.headers['docker-distribution-api-version'],
            //    'registry/2.0');

            var last = ress[ress.length - 1];
            t.ok(last);
            t.equal(last.statusCode, 200);

            // Content-Type:
            // - docker.io gives 'application/octet-stream', which is what
            //   I'd expect for the GET response at least.
            // - quay.io current v2 support gives: 'text/html; charset=utf-8'
            if (!SKIP_QUAY_IO_BUGLETS) {
                t.equal(last.headers['content-type'],
                    'application/octet-stream');
            }

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
            // - quay.io gives 405 (Method Not Allowed). Hrm.
            // The spec doesn't specify:
            // https://docs.docker.com/registry/spec/api/#existing-layers
            // t.equal(res.statusCode, 404);

            // Docker-Distribution-Api-Version header:
            // docker.io includes this header here, quay.io does not.
            // t.equal(res.headers['docker-distribution-api-version'],
            //    'registry/2.0');

            t.end();
        });
    });

    tt.test('  createBlobReadStream', function (t) {
        var digest = manifest.fsLayers[0].blobSum;
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

            // Docker-Distribution-Api-Version header:
            // docker.io includes this header here, quay.io does not.
            // t.equal(first.headers['docker-distribution-api-version'],
            //    'registry/2.0');

            t.ok(stream);
            t.equal(stream.statusCode, 200);

            // Quay.io gives `Content-Type: binary/octet-stream` which has to
            // be a bug. AFAIK that isn't a real MIME type.
            if (!SKIP_QUAY_IO_BUGLETS) {
                t.equal(stream.headers['content-type'],
                    'application/octet-stream');
            }

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
            // - quay.io gives 405 (Method Not Allowed). Hrm.
            // The spec doesn't specify:
            // https://docs.docker.com/registry/spec/api/#existing-layers
            // t.equal(res.statusCode, 404);

            // Docker-Distribution-Api-Version header:
            // docker.io includes this header here, quay.io does not.
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
