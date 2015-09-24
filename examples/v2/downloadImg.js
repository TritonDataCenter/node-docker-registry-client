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
 * Download a complete Docker image over the v2 API. This will download
 * the manifest and all layers to files in the current directory.
 */

var assert = require('assert-plus');
var format = require('util').format;
var fs = require('fs');
var once = require('once');
var progbar = require('progbar');
var vasync = require('vasync');

var drc = require('../../');
var mainline = require('../mainline');


var PROGRESS = true;


// Shared mainline with examples/foo.js to get CLI opts.
var cmd = 'downloadImg';
mainline({cmd: cmd}, function (log, parser, opts, args) {
    if (!args[0] || (args[0].indexOf(':') === -1 && !args[1])) {
        console.error('usage:\n' +
            '    node examples/v2/%s.js REPO@DIGEST\n' +
            '    node examples/v2/%s.js REPO:TAG\n' +
            '\n' +
            'options:\n' +
            '%s', cmd, cmd, parser.help().trimRight());
        process.exit(2);
    }

    // The interesting stuff starts here.
    var rat = drc.parseRepoAndTag(args[0]);
    console.log('Repo:', rat.canonicalName);
    var client = drc.createClientV2({
        scheme: rat.index.scheme,
        name: rat.canonicalName,
        log: log,
        insecure: opts.insecure,
        username: opts.username,
        password: opts.password
    });

    // Lazy progress bar. If we have a bar, then need to `bar.log(...)` messages
    // to the user.
    var bar;
    var barTimeout;
    function msg() {
        (bar ? bar.log.bind(bar) : console.log)(format.apply(null, arguments));
    }

    var manifest;
    var slug = rat.localName.replace(/[^\w]+/, '-') + '-' +
        (rat.tag ? rat.tag : rat.digest.slice(0, 12));

    vasync.pipeline({funcs: [
        function getTheManifest(_, next) {
            var ref = rat.tag || rat.digest;
            client.getManifest({ref: ref}, function (err, manifest_) {
                manifest = manifest_;
                next(err);
            });
        },

        function saveTheManifest(_, next) {
            var filename = slug + '.manifest';
            fs.writeFile(filename, JSON.stringify(manifest, null, 4),
                    function (err) {
                if (err) {
                    return next(err);
                }
                msg('Wrote manifest:', filename);
                next();
            });
        },

        function downloadLayers(_, next) {
            for (var i = 0; i < manifest.fsLayers.length; i++) {
                manifest.fsLayers[i].i = i + 1;
            }

            /*
             * Before setting up a progress bar, we'll wait for the
             * content-length of all layers. Then we'll only bother with the
             * progress bar if the download is taking greater than a few
             * seconds.
             */
            var cLens = [];
            var numBytes = 0;
            function cLenForBar(n) {
                cLens.push(n);
                if (PROGRESS && process.stderr.isTTY &&
                    cLens.length === manifest.fsLayers.length)
                {
                    barTimeout = setTimeout(function () {
                        bar = new progbar.ProgressBar({
                            filename: format('%s %d layers',
                                rat.localName, manifest.fsLayers.length),
                            size: cLens.reduce(function (a, b) { return a+b; })
                        });
                        bar.advance(numBytes); // starter value
                    }, 2000);
                }
            }

            vasync.forEachParallel({
                inputs: manifest.fsLayers,
                func: function downloadOneLayer(layer, nextLayer_) {
                    var nextLayer = once(nextLayer_);
                    client.createBlobReadStream({digest: layer.blobSum},
                            function (createErr, stream, ress) {
                        if (createErr) {
                            return nextLayer(createErr);
                        }
                        cLenForBar(Number(stream.headers['content-length']));
                        var filename = format('%s-%d-%s.layer', slug, layer.i,
                            layer.blobSum.split(':')[1].slice(0, 12));
                        var fout = fs.createWriteStream(filename);
                        fout.on('finish', function () {
                            msg('Downloaded layer %d of %d: %s',
                                layer.i, manifest.fsLayers.length, filename);
                            nextLayer();
                        });
                        stream.on('error', function (err) {
                            nextLayer(err);
                        });
                        fout.on('error', function (err) {
                            nextLayer(err);
                        });
                        stream.on('data', function (chunk) {
                            numBytes += chunk.length;
                            if (bar) {
                                bar.advance(chunk.length);
                            }
                        });
                        stream.pipe(fout);
                        stream.resume();
                    });
                }
            }, next);
        },

        function endProgbar(_, next) {
            if (barTimeout) {
                clearTimeout(barTimeout);
                barTimeout = null;
            }
            if (bar) {
                bar.end();
                bar = null;
            }
            next();
        }

    ]}, function (err) {
        client.close();
        if (err) {
            mainline.fail(cmd, err, opts);
        }
    });

});
