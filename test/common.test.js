/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

var test = require('tape');

var common = require('../lib/common');


// --- Tests

test('parseRepoAndTag', function (t) {
    var parseRepoAndTag = common.parseRepoAndTag;

    t.deepEqual(parseRepoAndTag('busybox'), {
        "index": {
            "name": "docker.io",
            "official": true
        },
        "official": true,
        "remoteName": "library/busybox",
        "localName": "busybox",
        "canonicalName": "docker.io/busybox",
        "tag": "latest"
    });
    t.deepEqual(parseRepoAndTag('google/python'), {
        "index": {
            "name": "docker.io",
            "official": true
        },
        "official": false,
        "remoteName": "google/python",
        "localName": "google/python",
        "canonicalName": "docker.io/google/python",
        "tag": "latest"
    });
    t.deepEqual(parseRepoAndTag('docker.io/ubuntu'), {
        "index": {
            "name": "docker.io",
            "official": true
        },
        "official": true,
        "remoteName": "library/ubuntu",
        "localName": "ubuntu",
        "canonicalName": "docker.io/ubuntu",
        "tag": "latest"
    });
    t.deepEqual(parseRepoAndTag('localhost:5000/blarg'), {
        "index": {
            "name": "localhost:5000",
            "official": false
        },
        "official": false,
        "remoteName": "blarg",
        "localName": "localhost:5000/blarg",
        "canonicalName": "localhost:5000/blarg",
        "tag": "latest"
    });

    t.deepEqual(parseRepoAndTag('localhost:5000/blarg:latest'), {
        "index": {
            "name": "localhost:5000",
            "official": false
        },
        "official": false,
        "remoteName": "blarg",
        "localName": "localhost:5000/blarg",
        "canonicalName": "localhost:5000/blarg",
        "tag": "latest"
    });
    t.deepEqual(parseRepoAndTag('localhost:5000/blarg:mytag'), {
        "index": {
            "name": "localhost:5000",
            "official": false
        },
        "official": false,
        "remoteName": "blarg",
        "localName": "localhost:5000/blarg",
        "canonicalName": "localhost:5000/blarg",
        "tag": "mytag"
    });
    t.deepEqual(parseRepoAndTag('localhost:5000/blarg@sha256:cafebabe'), {
        "index": {
            "name": "localhost:5000",
            "official": false
        },
        "official": false,
        "remoteName": "blarg",
        "localName": "localhost:5000/blarg",
        "canonicalName": "localhost:5000/blarg",
        "digest": "sha256:cafebabe"
    });

    t.end();
});


test('parseRepo', function (t) {
    var parseRepo = common.parseRepo;

    t.deepEqual(parseRepo('busybox'), {
        "index": {
            "name": "docker.io",
            "official": true
        },
        "official": true,
        "remoteName": "library/busybox",
        "localName": "busybox",
        "canonicalName": "docker.io/busybox"
    });
    t.deepEqual(parseRepo('google/python'), {
        "index": {
            "name": "docker.io",
            "official": true
        },
        "official": false,
        "remoteName": "google/python",
        "localName": "google/python",
        "canonicalName": "docker.io/google/python"
    });
    t.deepEqual(parseRepo('docker.io/ubuntu'), {
        "index": {
            "name": "docker.io",
            "official": true
        },
        "official": true,
        "remoteName": "library/ubuntu",
        "localName": "ubuntu",
        "canonicalName": "docker.io/ubuntu"
    });
    t.deepEqual(parseRepo('localhost:5000/blarg'), {
        "index": {
            "name": "localhost:5000",
            "official": false
        },
        "official": false,
        "remoteName": "blarg",
        "localName": "localhost:5000/blarg",
        "canonicalName": "localhost:5000/blarg"
    });

    t.end();
});
