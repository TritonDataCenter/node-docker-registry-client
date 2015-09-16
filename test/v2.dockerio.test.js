/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

var crypto = require('crypto');
var strsplit = require('strsplit');
var test = require('tape');

var drc = require('..');


// --- globals

var log = require('./lib/log');



// --- Tests

test('v2 docker.io', function (tt) {
    var client;

    tt.test('  createClient', function (t) {
        client = drc.createClientV2({
            name: 'busybox',
            log: log
        });
        t.ok(client);
        t.equal(client.version, 2);
        t.end();
    });

    tt.test('  ping', function (t) {
        client.ping(function (err, body, res) {
            t.ok(err);
            t.equal(res.statusCode, 401);
            t.ok(res.headers['www-authenticate']);
            t.end();
        })
    });

    /*
     *  {
     *      "name": "library/alpine",
     *      "tags": [ "2.6", "2.7", "3.1", "3.2", "edge", "latest" ]
     *  }
     */
    tt.test('  listTags', function (t) {
        client.listTags(function (err, tags) {
            t.ifErr(err);
            t.ok(tags);
            t.equal(tags.name, 'library/busybox');
            t.ok(tags.tags.indexOf('latest') !== -1);
            t.end();
        })
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
    tt.test('  getManifest', function (t) {
        client.getManifest({ref: 'latest'}, function (err, manifest_) {
            t.ifErr(err);
            manifest = manifest_;
            t.ok(manifest);
            t.equal(manifest.schemaVersion, 1);
            t.equal(manifest.name, 'library/busybox');
            t.equal(manifest.tag, 'latest');
            t.ok(manifest.architecture);
            t.ok(manifest.fsLayers);
            t.ok(manifest.history[0].v1Compatibility);
            t.ok(manifest.signatures[0].signature);
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
            t.equal(first.headers['docker-distribution-api-version'],
                'registry/2.0');
            var last = ress[ress.length - 1];
            t.ok(last);
            t.equal(last.statusCode, 200);
            t.equal(last.headers['content-type'], 'application/octet-stream');
            t.ok(last.headers['content-length']);
            t.end();
        });
    });

    tt.test('  headBlob (unknown digest)', function (t) {
        var digest = manifest.fsLayers[0].blobSum;
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

    //tt.test('getBlob', function (t) {
    //    var tarsum = manifest.fsLayers[0].blobSum;
    //    client.getBlob({digest: tarsum}, function (err, res, firstRes) {
    //        t.ifErr(err);
    //        t.ok(firstRes);
    //        t.ok(firstRes.statusCode === 200 || firstRes.statusCode === 307);
    //        t.equal(firstRes.headers['docker-content-digest'], tarsum);
    //        t.equal(firstRes.headers['docker-distribution-api-version'],
    //            'registry/2.0');
    //        t.ok(res);
    //        t.ok(res.statusCode === 200);
    //        t.equal(res.headers['content-type'], 'application/octet-stream');
    //        t.ok(res.headers['content-length']);
    //
    //        var tarsumParts = strsplit(tarsum, ':', 1);
    //        var checksum = crypto.createHash(tarsumParts[0]);
    //        res.on('data', function (chunk) {
    //            checksum.update(chunk);
    //        });
    //        res.on('end', function () {
    //            t.equal(tarsumParts[1], checksum.digest('hex'),
    //                'checksum matches for download');
    //            finish();
    //        });
    //        res.on('error', function (resErr) {
    //            t.ifErr(resErr);
    //            finish();
    //        });
    //
    //        var finished = false;
    //        function finish(err) {
    //            if (finished) {
    //                return;
    //            }
    //            finished = true;
    //            t.end();
    //        }
    //    });
    //});

    // XXX
    //tt.test('listRepoImgs', function (t) {
    //    client.listRepoImgs(function (err, imgs) {
    //        t.ifErr(err);
    //        t.ok(imgs);
    //        t.ok(imgs.length > 0);
    //        t.ok(imgs[0].id);
    //        var latestImg = imgs.filter(
    //            function (img) { return img.id === latestId; })[0];
    //        t.ok(latestImg);
    //        t.end();
    //    })
    //});
    //
    //tt.test('getImgId', function (t) {
    //    client.getImgId({tag: 'latest'}, function (err, imgId) {
    //        t.ifErr(err);
    //        t.ok(imgId);
    //        t.equal(imgId, latestId);
    //        t.end();
    //    })
    //});
    //
    //var latestAncestry;
    //
    //tt.test('getImgAncestry', function (t) {
    //    client.getImgAncestry({imgId: latestId}, function (err, ancestry) {
    //        t.ifErr(err);
    //        latestAncestry = ancestry;
    //        t.ok(ancestry);
    //        t.ok(ancestry.length > 0);
    //        t.equal(ancestry[0], latestId);
    //        t.end();
    //    })
    //});
    //
    //tt.test('getImgJson', function (t) {
    //    client.getImgJson({imgId: latestId}, function (err, imgJson) {
    //        t.ifErr(err);
    //        t.ok(imgJson);
    //        t.equal(imgJson.id, latestId);
    //        if (latestAncestry.length > 1) {
    //            t.equal(latestAncestry[1], imgJson.parent);
    //        }
    //        t.ok(imgJson.config);
    //        t.ok(imgJson.container_config);
    //        t.end();
    //    })
    //});
    //
    //tt.test('getImgLayerStream', function (t) {
    //    client.getImgLayerStream({imgId: latestId}, function (err, res) {
    //        t.ifErr(err);
    //        t.ok(res);
    //        t.equal(res.headers['content-type'], 'application/octet-stream');
    //
    //        var numBytes = 0;
    //        res.on('data', function (chunk) {
    //            numBytes += chunk.length;
    //        });
    //        res.on('error', function (err) {
    //            mainline.fail(cmd, 'error downloading: ' + err);
    //        });
    //        res.on('end', function () {
    //            t.equal(numBytes, Number(res.headers['content-length']));
    //            t.end();
    //        });
    //        res.resume();
    //    });
    //});
    //
    //tt.test('search node', function (t) {
    //    client.search({term: 'node'}, function (err, hits) {
    //        t.ifErr(err);
    //        t.ok(hits);
    //        t.equal(hits.page, 1);
    //        t.equal(hits.query, 'node');
    //        t.ok(hits.num_results > 0);
    //        // [ { is_automated: false,
    //        //   name: 'node',
    //        //   is_trusted: false,
    //        //   is_official: true,
    //        //   star_count: 737,
    //        //   description: 'Node.js is a ...'},
    //        var top = hits.results[0];
    //        t.ok(top.name);
    //        t.ok(top.is_official !== undefined);
    //        t.ok(top.is_trusted !== undefined);
    //        t.end();
    //    })
    //});

    tt.test('  close', function (t) {
        client.close();
        t.end();
    });
});
