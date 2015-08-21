# node-docker-registry-client

A Docker Registry API client for node.js.
Limitation: Currently on v1
(<https://docs.docker.com/v1.6/reference/api/registry_api/>) of the Registry API
is implemented. Support for v2 is planned.


## Overview

Most usage of this package involves creating a *Registry* API client for a
specific *repository* and calling its methods.

A Registry client requires a repository name (called a `repo` in the code):

    [INDEX/]NAME                # a "repo name"

Examples:

    mongo                       # implies default index (docker.io) and namespace (library)
    docker.io/mongo             # same thing
    docker.io/library/mongo     # same thing

    myreg.example.com:5000/busybox   # a "busybox" repo on a private registry

    quay.io/trentm/foo          # trentm's "foo" repo on the quay.io service

The `parseRepo` function is used to parse these. See "examples/parseRepo.js"
to see how they are parsed:

    $ node examples/parseRepo.js mongo
    {
        "index": {
            "name": "docker.io",
            "official": true
        },
        "official": true,
        "remoteName": "library/mongo",
        "localName": "mongo",
        "canonicalName": "docker.io/mongo"
    }


Commonly, a "repo name and tag" string is used for working with a Docker
registry, e.g. `docker pull busybox:latest`. This package provides
`parseRepoAndTag` for that, e.g.:

    $ node examples/parseRepoAndTag.js myreg.example.com:5000/busybox:foo
    {
        "index": {
            "name": "myreg.example.com:5000",
            "official": false
        },
        "official": false,
        "remoteName": "busybox",
        "localName": "myreg.example.com:5000/busybox",
        "canonicalName": "myreg.example.com:5000/busybox",
        "tag": "foo"
    }


Slightly different than docker.git's parsing, this package allows the
scheme to be given on the index:

    $ node examples/parseRepoAndTag.js https://quay.io/trentm/foo
    {
        "index": {
            "scheme": "https",              // <--- scheme
            "name": "quay.io",
            "official": false
        },
        "official": false,
        "remoteName": "trentm/foo",
        "localName": "quay.io/trentm/foo",
        "canonicalName": "quay.io/trentm/foo",
        "tag": "latest"                     // <--- default to 'latest' tag
    }

If a scheme isn't given, then "https" is assumed.


## Registry client

Typically:

    var repo = 'alpine';
    var client = drc.createClient({
        name: repo,
        agent: false,              // optional
        log: log,                  // optional
        username: opts.username,   // optional
        password: opts.password,   // optional
        // ... see the source code
    });
    client.listRepoTags(function (err, repoTags) {
        if (err) {
            console.log(err);
            process.exit(1);
        }
        console.log(JSON.stringify(repoTags, null, 4));
    });


See "examples/" for example usage of all of the API. E.g.:

    $ node examples/listRepoTags.js alpine
    {
        "2.6": "6e25877bc8bcf3fc0baedee3cdcb2375c108840b999ac5d2319800602cc4dc28",
        "2.7": "c22deeac7b1350109368da01902d83748a22e82847c1ba6e6d61f1869f6053c2",
        "3.1": "878b6301bedafae11e013d8393be8bb3919d06e06917007991933b59c040c7fe",
        "3.2": "31f630c65071968699d327be41add2e301d06568a4914e1aa67c98e1db34a9d8",
        "edge": "5e704a9ae9acbaa969da7bec6eca7c9b8682b71e9edbe7aace95cdb880dd05a0",
        "latest": "31f630c65071968699d327be41add2e301d06568a4914e1aa67c98e1db34a9d8"
    }


## Dev Notes

For naming this package attempts to consistently use `repo` for repository,
`img` for image, etc.
