/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2016, Joyent, Inc.
 */

var test = require('tape');

var drc = require('..');

// --- Tests

/* BEGIN JSSTYLED */
test('digestFromManifestStr', function (t) {
    var v1Manifest = {
       'schemaVersion': 1,
       'name': 'joyentunsupported/boxplay',
       'tag': 'latest',
       'architecture': 'amd64',
       'fsLayers': [
          {
             'blobSum': 'sha256:208e4cb1d5e8c6fdfadc4329baf4002821fe5e5359626336f64f0005737af272'
          },
          {
             'blobSum': 'sha256:84ff92691f909a05b224e1c56abb4864f01b4f8e3c854e4bb4c7baf1d3f6d652'
          },
          {
             'blobSum': 'sha256:483a41b4dbd5bb9bf388f24139441aa9b90735992ed8f31ec2092eb024d99130'
          },
          {
             'blobSum': 'sha256:84ff92691f909a05b224e1c56abb4864f01b4f8e3c854e4bb4c7baf1d3f6d652'
          }
       ],
       'history': [
          {
             'v1Compatibility': '{"architecture":"amd64","author":"Me Now \\u003cme@now.com\\u003e","comment":"","config":{"AttachStdin":false,"AttachStderr":false,"AttachStdout":false,"Cmd":["/bin/sh"],"Domainname":"","Entrypoint":null,"Env":null,"Hostname":"","Image":"d392a1eead454251ea968dc4f428d47ef48908a76d12ef35f779fb10a50b201a","Labels":null,"OnBuild":null,"OpenStdin":false,"StdinOnce":false,"Tty":false,"User":"","Volumes":null,"WorkingDir":""},"container_config":{"AttachStdin":false,"AttachStderr":false,"AttachStdout":false,"Cmd":["/bin/sh","-c","#(nop) ADD file:b8e9ba1de198a7d96b79a7c36b550cb173e43b0e284982cd499b3237eb4dba5a in /foo.txt"],"Domainname":"","Entrypoint":null,"Env":null,"Hostname":"","Image":"d392a1eead454251ea968dc4f428d47ef48908a76d12ef35f779fb10a50b201a","Labels":null,"OnBuild":null,"OpenStdin":false,"StdinOnce":false,"Tty":false,"User":"","Volumes":null,"WorkingDir":""},"created":"2016-06-09T09:12:07.905Z","docker_id":"8456d302663a475ece98e45f39c63c3e99a87e2f4a5866b6a9a18b086ea2a672","head":true,"heads":["8456d302663a475ece98e45f39c63c3e99a87e2f4a5866b6a9a18b086ea2a672"],"id":"c41134024f546d6799b51a0d0a804e3f46c15916f7953991f50d3ff82d5fe2ff","image_uuid":"ace5e05e-9b15-4535-b015-b55756769bbf","index_name":"docker.io","owner_uuid":"a270bf5f-8f75-4fb0-8b37-747e1b5d183d","parent":"10e6b79101c22e0a3f1df5111ee9c376bca885b4954ea9898f898fa6d51d21f0","private":true,"size":0,"virtual_size":11028992}'
          },
          {
             'v1Compatibility': '{"id":"10e6b79101c22e0a3f1df5111ee9c376bca885b4954ea9898f898fa6d51d21f0","parent":"86307648b49df4cdb60c9dc674621d3904be24748a72826a527f6fecb87efbdd","created":"2016-06-09T09:12:06.757Z","container_config":{"Cmd":["/bin/sh -c #(nop) [\\"/bin/sh\\"]"]},"author":"Me Now \\u003cme@now.com\\u003e"}'
          },
          {
             'v1Compatibility': '{"id":"86307648b49df4cdb60c9dc674621d3904be24748a72826a527f6fecb87efbdd","parent":"e35592687f380e8626ed172858fcdee3fab316977bc81296bc01de0a525241b1","created":"2016-06-09T09:12:06.648Z","container_config":{"Cmd":["/bin/sh -c #(nop) ADD file:c36f77eebbf6ed4c99488f33a7051c95ad358df4414dfed5006787f39b3cf518 in /"]},"author":"Me Now \\u003cme@now.com\\u003e"}'
          },
          {
             'v1Compatibility': '{"id":"e35592687f380e8626ed172858fcdee3fab316977bc81296bc01de0a525241b1","created":"2016-06-09T09:12:03.8Z","container_config":{"Cmd":["/bin/sh -c #(nop) MAINTAINER Me Now \\u003cme@now.com\\u003e"]},"author":"Me Now \\u003cme@now.com\\u003e"}'
          }
       ],
       'signatures': [
          {
             'header': {
                'jwk': {
                   'crv': 'P-256',
                   'kid': 'TDHB:4TXA:GUTQ:HPET:DV5N:PJPB:XDMT:X2FX:P4SR:OJ77:FSSN:MD5T',
                   'kty': 'EC',
                   'x': 'qXf9Xdjpv6zuDnXQQozI7kgr4NzrxfGamhzIYk1AtB0',
                   'y': 'TTtzXr2y44oHeDINWrrI8QZG18n7SzzOOuvKSMd9gKo'
                },
                'alg': 'ES256'
             },
             'signature': 'E7ZNnHDbAxIqo6-9fv1RxLzui0d4KG6k4Ciy6Jas5UIbElCYSukvI3PiRZZrEi3vn6JKGVDlYq5rExLByywCUg',
             'protected': 'eyJmb3JtYXRMZW5ndGgiOjMzMDYsImZvcm1hdFRhaWwiOiJDbjAiLCJ0aW1lIjoiMjAxNi0xMC0wNFQyMzozMDozNloifQ'
          }
       ]
    };
    var v1ManifestStr = JSON.stringify(v1Manifest, null, 3); // <-- Yes, f*n 3
    var v1Digest = drc.digestFromManifestStr(v1ManifestStr);
    t.equal(v1Digest, 'sha256:b524e5d7837da98010567886762935bf3c10ad5ac1ff5112bc43299329ca9a54');


    var v2Manifest = {
        'schemaVersion': 2,
        'mediaType': 'application/vnd.docker.distribution.manifest.v2+json',
        'config': {
            'mediaType': 'application/vnd.docker.container.image.v1+json',
            'size': 2372,
            'digest': 'sha256:ea880aeae3c3e357bbb7bb715f0f63f086038c7d279736d7f32960064951c00a'
        },
        'layers': [
            {
                'mediaType': 'application/vnd.docker.image.rootfs.diff.tar',
                'size': 10240,
                'digest': 'sha256:84ff92691f909a05b224e1c56abb4864f01b4f8e3c854e4bb4c7baf1d3f6d652'
            },
            {
                'mediaType': 'application/vnd.docker.image.rootfs.diff.tar',
                'size': 3573760,
                'digest': 'sha256:483a41b4dbd5bb9bf388f24139441aa9b90735992ed8f31ec2092eb024d99130'
            },
            {
                'mediaType': 'application/vnd.docker.image.rootfs.diff.tar',
                'size': 10240,
                'digest': 'sha256:84ff92691f909a05b224e1c56abb4864f01b4f8e3c854e4bb4c7baf1d3f6d652'
            },
            {
                'mediaType': 'application/vnd.docker.image.rootfs.diff.tar',
                'size': 10240,
                'digest': 'sha256:208e4cb1d5e8c6fdfadc4329baf4002821fe5e5359626336f64f0005737af272'
            }
        ]
    };
    var v2ManifestStr = JSON.stringify(v2Manifest);
    var v2Digest = drc.digestFromManifestStr(v2ManifestStr);
    t.equal(v2Digest, 'sha256:28a63cc341ad4ad7ba7de0af4061ca8068e425ecca4e2c4c326dd8d07442ab71');
    t.end();
});
/* END JSSTYLED */
