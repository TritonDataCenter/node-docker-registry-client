#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var clients = require('../lib/clients');


var repo = 'library/mongo';
var tag = 'latest';


clients.registry.createWithToken({ repo: repo }, function (err, client) {
    if (err) {
        return console.error(err.message);
    }

    client.getRepoTags(function (err2, tags) {
        if (err2) {
            return console.error('Error getting repo tags: ' + err2.message);
        }

        if (!tags.hasOwnProperty(tag)) {
            console.error('repo "%s" does not have tag "%s"', repo, tags);
            console.error('available tags: ' + Object.keys(tags).join(', '));
            return;
        }

        client.getImageAncestry(tags[tag], function (err3, ancestry) {
            if (err3) {
                return console.error('Error getting image ancestry: '
                    + err3.message);
            }

            return console.log(JSON.stringify(ancestry, null, 2));
        });
    });
});
