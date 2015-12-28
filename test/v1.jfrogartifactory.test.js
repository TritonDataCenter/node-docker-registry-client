/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Test Docker v1 Registry in a jfrog artifactory repo, if there is a local
 * config with repo details.
 *
 * This requires a test/config.json something like this:
 *
 *      {
 *          "v1jfrogartifactory": {
 *              "repo": "trentm.artifactoryonline.com/busybox",
 *              "username": "admin",
 *              "password": "(your password)",
 *              "tag": "latest",
 *              "searchTerm": "busy"
 *          }
 *      }
 *
 * See DOCKER-419 for details on how to setup a Docker v1 registry with
 * a demo account of jfrog artifactory.
 * <https://www.jfrog.com/artifactory/free-trial/>
 */

var assert = require('assert-plus');
var test = require('tape');

var drc = require('..');


// --- globals

var log = require('./lib/log');
var CONFIG;
try {
    CONFIG = require(__dirname + '/config.json').v1jfrogartifactory;
    assert.object(CONFIG, 'config.json#v1jfrogartifactory');
    assert.string(CONFIG.repo, 'CONFIG.repo');
    assert.string(CONFIG.username, 'CONFIG.username');
    assert.string(CONFIG.password, 'CONFIG.password');
    assert.string(CONFIG.tag, 'CONFIG.tag');
    assert.string(CONFIG.searchTerm, 'CONFIG.searchTerm');
} catch (e) {
    CONFIG = null;
    log.warn(e, 'skipping v1 jfrog artifactory tests: ' +
        'could not load "v1jfrogartifactory" key from test/config.json');
    console.warn('# warning: skipping v1 jfrog artifactory tests: %s',
        e.message);
}


// --- Tests

if (CONFIG)
test('v1 jfrog artifactory: ' + CONFIG.repo, function (tt) {
    var client = drc.createClientV1({
        name: CONFIG.repo,
        username: CONFIG.username,
        password: CONFIG.password,
        log: log
    });
    var repo = drc.parseRepo(CONFIG.repo);

    tt.test(' ping', function (t) {
        client.ping(function (err, status, res) {
            t.ifErr(err);
            t.equal(status, true);
            t.end();
        });
    });

    tt.test(' search', function (t) {
        client.search({term: CONFIG.searchTerm}, function (err, results, res) {
            t.ifErr(err);
            if (!err) {
                t.ok(results);
                t.ok(results.num_results);
                var hit = results.results.filter(function (r) {
                    return r.name.indexOf(repo.remoteName) !== -1;
                })[0];
                t.ok(hit);
            }
            t.end();
        });
    });

    tt.test(' listRepoImgs', function (t) {
        client.listRepoImgs(function (err, imgs) {
            t.ifErr(err);
            t.ok(Array.isArray(imgs));
            t.ok(imgs.length > 0);
            t.ok(/[0-9a-f]{64}/.test(imgs[0].id));
            t.end();
        });
    });

    var tag = CONFIG.tag;
    var repoTags;

    tt.test(' listRepoTags', function (t) {
        client.listRepoTags(function (err, repoTags_) {
            repoTags = repoTags_;
            t.ifErr(err);
            t.equal(typeof (repoTags), 'object');
            t.ok(repoTags[tag]);
            t.ok(/[0-9a-f]{64}/.test(repoTags[tag]));
            t.end();
        });
    });

    tt.test(' getImgId', function (t) {
        client.getImgId({tag: tag}, function (err, imgId) {
            t.ifErr(err);
            t.ok(imgId);
            t.ok(/[0-9a-f]{64}/.test(imgId));
            t.equal(imgId, repoTags[tag]);
            t.end();
        });
    });

    tt.test(' getImgAncestry', function (t) {
        client.getImgAncestry({imgId: repoTags[tag]}, function (err, ancestry) {
            t.ifErr(err);
            t.ok(Array.isArray(ancestry));
            t.ok(ancestry.length > 0);
            t.equal(ancestry[0], repoTags[tag]);
            t.end();
        });
    });

    tt.test(' getImgJson', function (t) {
        var imgId = repoTags[tag];
        client.getImgJson({imgId: imgId}, function (err, imgJson, res) {
            t.ifErr(err);
            t.equal(imgJson.id, imgId);
            t.ok(imgJson.config);
            t.end();
        });
    });

    tt.test(' getImgLayerStream', function (t) {
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



    tt.test(' close', function (t) {
        client.close();
        t.end();
    });
});
