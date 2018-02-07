/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/*
 * For Google Container Registry private tests, you'll need:
 *  - the Google Cloud Platform Consol (gcloud) installed
 *  - a Google Container Registry project configured (i.e. to push to)
 *  - create the *short-lived* auth config for your gcr.io account
 *    `gcloud docker -a -s gcr.io`
 *  - split out username/password from the ~/.docker/config.json
 */

var assert = require('assert-plus');
var crypto = require('crypto');
var test = require('tape');
var util = require('util');

var drc = require('..');


// --- globals

var format = util.format;
var log = require('./lib/log');

var CONFIG;
try {
    CONFIG = require(__dirname + '/config.json').gcrprivate;
    assert.object(CONFIG, 'config.json#gcrprivate');
    assert.string(CONFIG.repo, 'CONFIG.repo');
    assert.string(CONFIG.tag, 'CONFIG.tag');
    assert.string(CONFIG.username, 'CONFIG.username');
    assert.string(CONFIG.password, 'CONFIG.password');
} catch (e) {
    CONFIG = null;
    log.warn(e, 'skipping Google Container Registry private tests: ' +
        'could not load "gcrprivate" key from test/config.json');
    console.warn('# warning: skipping Google Registry private tests: %s',
        e.message);
}

// --- Tests

if (CONFIG)
test('v2 gcr.io private', function (tt) {
    var client;
    var repo = drc.parseRepo(CONFIG.repo);

    tt.test('  createClient', function (t) {
        client = drc.createClientV2({
            name: CONFIG.repo,
            maxSchemaVersion: 2,
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
     *  {
     *      "schemaVersion": 2,
     *      "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
     *      "config": {
     *          "mediaType": "application/vnd.docker.container.image.v1+json",
     *          "size": 1584,
     *          "digest": "sha256:99e59f495ffaa2...545ab2bbe3b1b1ec3bd0b2"
     *      },
     *      "layers": [
     *          {
     *              "mediaType": "application/vnd.docker...diff.tar.gzip",
     *              "size": 32,
     *              "digest": "sha256:a3ed95caeb02ff...d00e8a7c22955b46d4"
     *          }
     *      ]
     *  }
     */
    var blobDigest;
    var manifest;
    var manifestDigest;
    var manifestStr;
    tt.test('  getManifest', function (t) {
        client.getManifest({ref: CONFIG.tag},
                function (err, manifest_, res, manifestStr_) {
            t.ifErr(err);
            manifest = manifest_;
            manifestDigest = res.headers['docker-content-digest'];
            t.ok(manifestDigest, 'has a docker-content-digest header');
            manifestStr = manifestStr_;
            t.ok(manifest);
            t.equal(manifest.schemaVersion, 2);
            t.ok(manifest.config);
            t.ok(manifest.config.digest);
            t.ok(manifest.layers);
            t.ok(manifest.layers[0]);
            t.ok(manifest.layers[0].digest);
            blobDigest = manifest.layers[0].digest;
            t.end();
        });
    });

    tt.test('  getManifest (by digest)', function (t) {
        client.getManifest({ref: manifestDigest}, function (err, manifest_) {
            t.ifErr(err);
            t.ok(manifest_);
            ['config',
             'layers',
             'mediaType',
             'schemaVersion'].forEach(function (k) {
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

    tt.test('  headBlob', function (t) {
        client.headBlob({digest: blobDigest}, function (err, ress) {
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
                t.equal(first.headers['docker-content-digest'], blobDigest);
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
        client.createBlobReadStream({digest: blobDigest},
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
                t.equal(first.headers['docker-content-digest'], blobDigest);
            }

            // Docker-Distribution-Api-Version header:
            // docker.io includes this header here, gcr.io does not.
            t.equal(first.headers['docker-distribution-api-version'],
                'registry/2.0');

            t.ok(stream);
            t.equal(stream.statusCode, 200);
            t.equal(stream.headers['content-type'],
                'application/octet-stream');
            t.ok(stream.headers['content-length']);

            var numBytes = 0;
            var hash = crypto.createHash(blobDigest.split(':')[0]);
            stream.on('data', function (chunk) {
                hash.update(chunk);
                numBytes += chunk.length;
            });
            stream.on('end', function () {
                t.equal(hash.digest('hex'), blobDigest.split(':')[1]);
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

    tt.test('  blobUpload', function (t) {
        client.createBlobReadStream({digest: blobDigest},
                function (err, stream, ress) {
            t.ifErr(err, 'createBlobReadStream err');

            var last = ress[ress.length - 1];
            var uploadOpts = {
                contentLength: parseInt(last.headers['content-length'], 10),
                digest: blobDigest,
                stream: stream
            };
            client.blobUpload(uploadOpts, function _uploadCb(uploadErr, res) {
                t.ifErr(uploadErr, 'check blobUpload err');
                t.equal(res.headers['docker-content-digest'], blobDigest,
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
            //t.equal(res.headers['docker-content-digest'], manifestDigest,
            //    'Response header digest should match manifest digest');
            t.end();
        });
    });

    tt.test('  close', function (t) {
        client.close();
        t.end();
    });
});
