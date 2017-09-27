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

test('parseRepoAndRef', function (t) {
    var parseRepoAndRef = common.parseRepoAndRef;

    t.deepEqual(parseRepoAndRef('busybox'), {
        'index': {
            'name': 'docker.io',
            'official': true
        },
        'official': true,
        'remoteName': 'library/busybox',
        'localName': 'busybox',
        'canonicalName': 'docker.io/busybox',
        'tag': 'latest'
    });
    t.deepEqual(parseRepoAndRef('google/python'), {
        'index': {
            'name': 'docker.io',
            'official': true
        },
        'official': false,
        'remoteName': 'google/python',
        'localName': 'google/python',
        'canonicalName': 'docker.io/google/python',
        'tag': 'latest'
    });
    t.deepEqual(parseRepoAndRef('docker.io/ubuntu'), {
        'index': {
            'name': 'docker.io',
            'official': true
        },
        'official': true,
        'remoteName': 'library/ubuntu',
        'localName': 'ubuntu',
        'canonicalName': 'docker.io/ubuntu',
        'tag': 'latest'
    });
    t.deepEqual(parseRepoAndRef('localhost:5000/blarg'), {
        'index': {
            'name': 'localhost:5000',
            'official': false
        },
        'official': false,
        'remoteName': 'blarg',
        'localName': 'localhost:5000/blarg',
        'canonicalName': 'localhost:5000/blarg',
        'tag': 'latest'
    });

    t.deepEqual(parseRepoAndRef('localhost:5000/blarg:latest'), {
        'index': {
            'name': 'localhost:5000',
            'official': false
        },
        'official': false,
        'remoteName': 'blarg',
        'localName': 'localhost:5000/blarg',
        'canonicalName': 'localhost:5000/blarg',
        'tag': 'latest'
    });
    t.deepEqual(parseRepoAndRef('localhost:5000/blarg:mytag'), {
        'index': {
            'name': 'localhost:5000',
            'official': false
        },
        'official': false,
        'remoteName': 'blarg',
        'localName': 'localhost:5000/blarg',
        'canonicalName': 'localhost:5000/blarg',
        'tag': 'mytag'
    });
    t.deepEqual(parseRepoAndRef('localhost:5000/blarg@sha256:cafebabe'), {
        'index': {
            'name': 'localhost:5000',
            'official': false
        },
        'official': false,
        'remoteName': 'blarg',
        'localName': 'localhost:5000/blarg',
        'canonicalName': 'localhost:5000/blarg',
        'digest': 'sha256:cafebabe'
    });

    // With alternate default index.
    t.deepEqual(parseRepoAndRef('foo/bar', 'docker.io'), {
        'index': {
            'name': 'docker.io',
            'official': true
        },
        'official': false,
        'remoteName': 'foo/bar',
        'localName': 'foo/bar',
        'canonicalName': 'docker.io/foo/bar',
        'tag': 'latest'
    });

    var defaultIndex = 'https://myreg.example.com:1234';
    t.deepEqual(parseRepoAndRef('foo/bar', defaultIndex), {
        'index': {
            'scheme': 'https',
            'name': 'myreg.example.com:1234',
            'official': false
        },
        'official': false,
        'remoteName': 'foo/bar',
        'localName': 'myreg.example.com:1234/foo/bar',
        'canonicalName': 'myreg.example.com:1234/foo/bar',
        'tag': 'latest'
    });

    defaultIndex = {
        'scheme': 'https',
        'name': 'myreg.example.com:1234',
        'official': false
    };
    t.deepEqual(parseRepoAndRef('foo/bar', defaultIndex), {
        'index': {
            'scheme': 'https',
            'name': 'myreg.example.com:1234',
            'official': false
        },
        'official': false,
        'remoteName': 'foo/bar',
        'localName': 'myreg.example.com:1234/foo/bar',
        'canonicalName': 'myreg.example.com:1234/foo/bar',
        'tag': 'latest'
    });

    t.end();
});


test('parseRepoAndTag', function (t) {
    var parseRepoAndTag = common.parseRepoAndTag;

    t.deepEqual(parseRepoAndTag('busybox'), {
        'index': {
            'name': 'docker.io',
            'official': true
        },
        'official': true,
        'remoteName': 'library/busybox',
        'localName': 'busybox',
        'canonicalName': 'docker.io/busybox',
        'tag': 'latest'
    });
    t.deepEqual(parseRepoAndTag('google/python'), {
        'index': {
            'name': 'docker.io',
            'official': true
        },
        'official': false,
        'remoteName': 'google/python',
        'localName': 'google/python',
        'canonicalName': 'docker.io/google/python',
        'tag': 'latest'
    });
    t.deepEqual(parseRepoAndTag('docker.io/ubuntu'), {
        'index': {
            'name': 'docker.io',
            'official': true
        },
        'official': true,
        'remoteName': 'library/ubuntu',
        'localName': 'ubuntu',
        'canonicalName': 'docker.io/ubuntu',
        'tag': 'latest'
    });
    t.deepEqual(parseRepoAndTag('localhost:5000/blarg'), {
        'index': {
            'name': 'localhost:5000',
            'official': false
        },
        'official': false,
        'remoteName': 'blarg',
        'localName': 'localhost:5000/blarg',
        'canonicalName': 'localhost:5000/blarg',
        'tag': 'latest'
    });

    t.deepEqual(parseRepoAndTag('localhost:5000/blarg:latest'), {
        'index': {
            'name': 'localhost:5000',
            'official': false
        },
        'official': false,
        'remoteName': 'blarg',
        'localName': 'localhost:5000/blarg',
        'canonicalName': 'localhost:5000/blarg',
        'tag': 'latest'
    });
    t.deepEqual(parseRepoAndTag('localhost:5000/blarg:mytag'), {
        'index': {
            'name': 'localhost:5000',
            'official': false
        },
        'official': false,
        'remoteName': 'blarg',
        'localName': 'localhost:5000/blarg',
        'canonicalName': 'localhost:5000/blarg',
        'tag': 'mytag'
    });
    t.deepEqual(parseRepoAndTag('localhost:5000/blarg@sha256:cafebabe'), {
        'index': {
            'name': 'localhost:5000',
            'official': false
        },
        'official': false,
        'remoteName': 'blarg',
        'localName': 'localhost:5000/blarg',
        'canonicalName': 'localhost:5000/blarg',
        'digest': 'sha256:cafebabe'
    });

    // With alternate default index.
    t.deepEqual(parseRepoAndTag('foo/bar', 'docker.io'), {
        'index': {
            'name': 'docker.io',
            'official': true
        },
        'official': false,
        'remoteName': 'foo/bar',
        'localName': 'foo/bar',
        'canonicalName': 'docker.io/foo/bar',
        'tag': 'latest'
    });

    var defaultIndex = 'https://myreg.example.com:1234';
    t.deepEqual(parseRepoAndTag('foo/bar', defaultIndex), {
        'index': {
            'scheme': 'https',
            'name': 'myreg.example.com:1234',
            'official': false
        },
        'official': false,
        'remoteName': 'foo/bar',
        'localName': 'myreg.example.com:1234/foo/bar',
        'canonicalName': 'myreg.example.com:1234/foo/bar',
        'tag': 'latest'
    });

    defaultIndex = {
        'scheme': 'https',
        'name': 'myreg.example.com:1234',
        'official': false
    };
    t.deepEqual(parseRepoAndTag('foo/bar', defaultIndex), {
        'index': {
            'scheme': 'https',
            'name': 'myreg.example.com:1234',
            'official': false
        },
        'official': false,
        'remoteName': 'foo/bar',
        'localName': 'myreg.example.com:1234/foo/bar',
        'canonicalName': 'myreg.example.com:1234/foo/bar',
        'tag': 'latest'
    });

    t.end();
});


test('parseRepo', function (t) {
    var parseRepo = common.parseRepo;

    t.deepEqual(parseRepo('busybox'), {
        'index': {
            'name': 'docker.io',
            'official': true
        },
        'official': true,
        'remoteName': 'library/busybox',
        'localName': 'busybox',
        'canonicalName': 'docker.io/busybox'
    });
    t.deepEqual(parseRepo('google/python'), {
        'index': {
            'name': 'docker.io',
            'official': true
        },
        'official': false,
        'remoteName': 'google/python',
        'localName': 'google/python',
        'canonicalName': 'docker.io/google/python'
    });
    t.deepEqual(parseRepo('docker.io/ubuntu'), {
        'index': {
            'name': 'docker.io',
            'official': true
        },
        'official': true,
        'remoteName': 'library/ubuntu',
        'localName': 'ubuntu',
        'canonicalName': 'docker.io/ubuntu'
    });
    t.deepEqual(parseRepo('localhost:5000/blarg'), {
        'index': {
            'name': 'localhost:5000',
            'official': false
        },
        'official': false,
        'remoteName': 'blarg',
        'localName': 'localhost:5000/blarg',
        'canonicalName': 'localhost:5000/blarg'
    });

    // With alternate default index.
    t.deepEqual(parseRepo('foo/bar', 'docker.io'), {
        'index': {
            'name': 'docker.io',
            'official': true
        },
        'official': false,
        'remoteName': 'foo/bar',
        'localName': 'foo/bar',
        'canonicalName': 'docker.io/foo/bar'
    });

    var defaultIndex = 'https://myreg.example.com:1234';
    t.deepEqual(parseRepo('foo/bar', defaultIndex), {
        'index': {
            'scheme': 'https',
            'name': 'myreg.example.com:1234',
            'official': false
        },
        'official': false,
        'remoteName': 'foo/bar',
        'localName': 'myreg.example.com:1234/foo/bar',
        'canonicalName': 'myreg.example.com:1234/foo/bar'
    });

    defaultIndex = {
        'scheme': 'https',
        'name': 'myreg.example.com:1234',
        'official': false
    };
    t.deepEqual(parseRepo('foo/bar', defaultIndex), {
        'index': {
            'scheme': 'https',
            'name': 'myreg.example.com:1234',
            'official': false
        },
        'official': false,
        'remoteName': 'foo/bar',
        'localName': 'myreg.example.com:1234/foo/bar',
        'canonicalName': 'myreg.example.com:1234/foo/bar'
    });

    t.throws(
        function () {
            parseRepo('registry.gitlab.com/user@name/repo-a/repo-b');
        },
        /invalid repository namespace/);

    t.deepEqual(parseRepo('registry.gitlab.com/user.name/repo-a/repo-b'), {
        'index': {
            'name': 'registry.gitlab.com',
            'official': false
        },
        'official': false,
        'remoteName': 'user.name/repo-a/repo-b',
        'localName': 'registry.gitlab.com/user.name/repo-a/repo-b',
        'canonicalName': 'registry.gitlab.com/user.name/repo-a/repo-b'
    });

    t.end();
});


test('parseIndex', function (t) {
    var parseIndex = common.parseIndex;

    t.deepEqual(parseIndex('docker.io'), {
        'name': 'docker.io',
        'official': true
    });
    t.deepEqual(parseIndex('index.docker.io'), {
        'name': 'docker.io',
        'official': true
    });
    t.deepEqual(parseIndex('https://docker.io'), {
        'name': 'docker.io',
        'official': true,
        'scheme': 'https'
    });
    t.throws(function () { parseIndex('http://docker.io'); },
        /disallowed/);
    t.deepEqual(parseIndex('index.docker.io'), {
        'name': 'docker.io',
        'official': true
    });
    t.deepEqual(parseIndex('quay.io'), {
        'name': 'quay.io',
        'official': false
    });
    t.deepEqual(parseIndex('https://quay.io'), {
        'name': 'quay.io',
        'official': false,
        'scheme': 'https'
    });
    t.deepEqual(parseIndex('http://quay.io'), {
        'name': 'quay.io',
        'official': false,
        'scheme': 'http'
    });
    t.deepEqual(parseIndex('localhost:5000'), {
        'name': 'localhost:5000',
        'official': false
    });

    t.throws(function () { parseIndex('https://'); },
        /empty/);
    t.throws(function () { parseIndex('https://foo'); },
        /look/);
    t.throws(function () { parseIndex('foo'); },
        /look/);

    t.deepEqual(parseIndex('docker.io/'), {
        'name': 'docker.io',
        'official': true
    });
    t.throws(function () { parseIndex('docker.io/foo'); },
        /invalid/);

    // Test special casing for this URL passed from 'docker login' by default.
    t.deepEqual(parseIndex('https://index.docker.io/v1/'), {
        'name': 'docker.io',
        'official': true
    });

    t.end();
});
