#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

var fs = require('fs');
var path = require('path');
var clients = require('../lib/clients');

var idx = clients.index.create({});
var g_repo = 'library/mongo';
var g_tag = 'latest';
var g_dir = path.resolve(__dirname, '..', 'images');

// Create the images directory if it doesn't exist yet.
if (!fs.existsSync(g_dir)) {
    try {
        fs.mkdirSync(g_dir);
    } catch (ex) {
        console.error('Unable to create images directory: ' + ex);
        return;
    }
}

console.log("Images dir: " + g_dir);

/**
 * Returns an array of dependencies (ancestors) for the given repo:tag.
 */
function getImageAncestry(client, repo, tag, callback) {
    client.getRepoTags(function (err2, tags) {
        if (err2) {
            return console.error('Error getting repo tags: ' + err2.message);
        }

        if (!tags.hasOwnProperty(tag)) {
            console.error('repo "%s" does not have tag "%s"', repo, tags);
            console.error('available tags: ' + Object.keys(tags).join(', '));
            return;
        }

        client.getImageAncestry(tags[tag], callback);
    });
}

/**
 * Downloads the given registry repo:tag (and it's dependencies) into the given
 * directory.
 */
function downloadRegistryImage(client, repo, tag, dirpath) {
    getImageAncestry(client, repo, tag, function(err, images) {
        if (err) {
            console.error('Error getting image ancestry: ' + err.message);
            return;
        }

        // Download all images in the ancestry.
        // TODO: Perhaps queuing, to avoid downloading all at once?
        images.forEach(function(image) {
            // Check if the image already exists.
            var filepath = path.join(dirpath, image);
            if (fs.existsSync(filepath)) {
                // TODO: Verify if image is up-to-date (or will docker use a
                //       different hash if it's modified)?
                console.log("Already downloaded image: " + image);
                return;
            }

            //console.log("Getting meta data for image " + image);

            client.getImageMetadata(image, function(err2, imgData) {
                if (err2) {
                    console.error('Error getting image metadata: ' + err2.message);
                    return;
                }

                //console.log(imgData);
                console.log("Downloading image: " + image);

                // Download to a temporary file, then atomic rename on success.
                // This ensures that if the image file exists, then it's been
                // fully downloaded.
                var tmp_filepath = path.join(dirpath, image + ".partial");

                // TODO: If a tmp_filepath exists, could perform HTTP reget.
                client.downloadImageLayer(image, tmp_filepath,
                                          function(err3, resp, body) {
                    if (err3) {
                        console.error('Error downloading image: ' + err3.message);
                        return;
                    }

                    // TODO: Verify download - is there a checksum somewhere?

                    // Download was successful - rename the tmp file.
                    fs.rename(tmp_filepath, filepath);
                    console.log("Successfully downloaded image: " + image);
                });
            });
        });
    });
}

clients.registry.createWithToken({ repo: g_repo }, function (err, client) {
    // TODO: g_dir may not exist yet.
    downloadRegistryImage(client, g_repo, g_tag, g_dir);
});
