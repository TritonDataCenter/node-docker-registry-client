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
 * Test v2 Registry API against <registry.access.redhat.com>.
 */

var test = require('tape');

var drc = require('..');


// --- globals

var log = require('./lib/log');

var REPO = 'registry.access.redhat.com/ubi8/ubi';
var TAG = 'latest';


// --- Tests

test('v2 registry.access.redhat.com', function (tt) {
    var client;

    tt.test('  createClient', function (t) {
        client = drc.createClientV2({
            log: log,
            maxSchemaVersion: 2,
            name: REPO
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
            t.ifErr(err, 'ping should not err');
            t.ok(res, 'have a response');
            if (res) {
                t.equal(res.statusCode, 200);
                t.equal(res.headers['docker-distribution-api-version'],
                    'registry/2.0');
            }
            t.end();
        });
    });

    tt.skip(' getManifest (no redirects)', function (t) {
        client.getManifest({ref: TAG, followRedirects: false},
            function (err, manifest, res) {
            // Should get a 302 error.
            t.ok(err, 'is error?');
            t.equal(res.statusCode, 302, 'statusCode should be 302');
            t.end();
        });
    });

    tt.test(' getManifest (redirected)', function (t) {
        client.getManifest({ref: TAG,
                maxSchemaVersion: 2,
                acceptManifestLists: false
        }, function (err, manifest, res, manifestStr) {
            res.log.info({m: manifest}, 'the manifest');
            t.ifErr(err);
            t.ok(manifest, 'Got the manifest');
            t.equal(manifest.schemaVersion, 2);
            t.ok(manifest.config);
            t.ok(manifest.config.digest, manifest.config.digest);
            t.ok(manifest.layers);
            t.ok(manifest.layers.length > 0);
            t.ok(manifest.layers[0].digest);

            t.end();
        });
    });

    tt.test(' close', function (t) {
        client.close();
        t.end();
    });
});
