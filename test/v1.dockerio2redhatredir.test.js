/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 * Copyright 2023 MNX Cloud, Inc.
 */

/*
 * Test v1 pull of 'rhel7' from Docker Hub, which (at least at time of
 * writing) redirects to <registry.access.redhat.com>.
 */

var test = require('tape');

var drc = require('..');


// --- globals

var log = require('./lib/log');


// --- Tests

test('v1 docker.io redir to redhat', function (tt) {
    var client;

    tt.test('  createClient', function (t) {
        client = drc.createClientV1({
            name: 'rhel7',
            log: log
        });
        t.ok(client);
        t.equal(client.version, 1);
        t.end();
    });

    tt.skip('  ping', function (t) {
        client.ping(function (err, status, res) {
            t.ifErr(err);
            t.equal(status, true);
            t.end();
        });
    });

    tt.skip('  listRepoImgs', function (t) {
        client.listRepoImgs(function (err, imgs) {
            t.ifErr(err);
            t.ok(Array.isArray(imgs));
            t.ok(imgs.length > 0);
            t.ok(/[0-9a-f]{64}/.test(imgs[0].id));
            t.end();
        });
    });

    var tag = 'latest';
    var repoTags;

    tt.skip('  listRepoTags', function (t) {
        client.listRepoTags(function (err, repoTags_) {
            repoTags = repoTags_;
            t.ifErr(err);
            t.equal(typeof (repoTags), 'object');
            t.ok(repoTags[tag]);
            t.ok(/[0-9a-f]{64}/.test(repoTags[tag]));
            t.end();
        });
    });

    tt.skip('  getImgId', function (t) {
        client.getImgId({tag: tag}, function (err, imgId) {
            t.ifErr(err);
            t.ok(imgId);
            t.ok(/[0-9a-f]{64}/.test(imgId));
            t.equal(imgId, repoTags[tag]);
            t.end();
        });
    });

    tt.skip('  getImgAncestry', function (t) {
        client.getImgAncestry({imgId: repoTags[tag]}, function (err, ancestry) {
            t.ifErr(err);
            t.ok(Array.isArray(ancestry));
            t.ok(ancestry.length > 0);
            t.equal(ancestry[0], repoTags[tag]);
            t.end();
        });
    });

    tt.skip('  getImgJson', function (t) {
        var imgId = repoTags[tag];
        client.getImgJson({imgId: imgId}, function (err, imgJson, res) {
            t.ifErr(err);
            t.equal(imgJson.id, imgId);
            t.ok(imgJson.config);
            t.end();
        });
    });

    tt.skip('  getImgLayerStream', function (t) {
        var imgId = repoTags[tag];
        client.getImgLayerStream({imgId: imgId}, function (getErr, stream) {
            t.ifErr(getErr, 'no error');
            if (getErr) {
                return t.end();
            }

            t.ok(stream.headers, 'have headers');

            var numBytes = 0;
            stream.on('data', function (chunk) {
                numBytes += chunk.length;
            });
            stream.on('error', function (err) {
                t.ifErr(err);
                t.end();
            });
            stream.on('end', function () {
                t.ok(numBytes > 0, 'downloaded ' + numBytes + ' bytes');
                t.end();
            });
            stream.resume();
        });
    });

    tt.test('  close', function (t) {
        client.close();
        t.end();
    });
});
