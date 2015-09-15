#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Example showing the Docker Index API search endpoint usage.
 * This is effectively what `docker search TERM` is, but `docker` calls
 * the Docker engine (via the Remote API) and the engine calls the Index API.
 */

var p = console.error;
var drc = require('../../');
var mainline = require('../mainline');

// Shared mainline with examples/foo.js to get CLI opts.
var cmd = 'search';
mainline({cmd: cmd}, function (log, parser, opts, args) {
    var name = args[0];
    if (!name) {
        console.error('usage: node examples/v1/%s.js [INDEX/]TERM\n' +
            '\n' +
            'options:\n' +
            '%s', cmd, parser.help().trimRight());
        process.exit(2);
    }


    // The interesting stuff starts here.
    var repo = drc.parseRepo(name);

    // Per docker.git:registry/config.go#RepositoryInfo.GetSearchTerm()
    // avoid the "library/" auto-prefixing done for the "official" index.
    // Basically using `parseRepo` for the search arg is a light
    // hack because the term isn't a "repo" string.
    var term = repo.index.official ? repo.localName : repo.remoteName;

    p('# index: %j', repo.index.name);
    p('# term: %j', term);

    var client = drc.createClientV1({
        name: name,
        log: log,
        insecure: opts.insecure,
        username: opts.username,
        password: opts.password
    });
    client.search({term: term}, function (err, results, res) {
        client.close();
        if (err) {
            mainline.fail(cmd, err, opts);
        }
        console.log(JSON.stringify(results, null, 4));
    });


});
