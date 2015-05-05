# node-docker-registry-client

A Docker Registry API client for node.js.
Limitation: Currently on v1 of the Registry API is implemented. Support for v2
is planned.

XXX docs are out of date for the 1.0.0 re-write.


## Terminology

(I'm talking v1 here. v2 support will come later.)

The "Docker Registry" docs can be a little confusing. There are two APIs in
play: the Index API (sometimes called the "Hub API") and the Registry API. There
are a few auth-related endpoints and headers. Standalone registries (i.e. those
not connected with Docker Hub) and Docker Hub use different auth mechanisms.
"Image" is commonly used when referring to a repo. "The Registry" is often used
when referring to the docker Hub/Index. My understanding with v2 work is that
the concept of "Index" as separate from "Registry" is going away, though
the field name "Index" remains in code (both in docker.git and in this
module for comparability).

Working with Docker images involves the following types of things:

- index: The central Docker Hub API to handle Token-based auth for registries
  associated with Docker Hub (this seems to be only used by Docker Hub itself)
  and (theoretically) discovery of repositores in various registries.
- registry: A server that holds Docker image repositories.
- repositories: Images are grouped into named `repos`, e.g.
  ["google/python"](https://registry.hub.docker.com/u/google/python/),
  ["library/mongo"](https://registry.hub.docker.com/u/library/mongo/).
  On the "official" Docker Hub registry the "library" `namespace` are
  special "official" repos managed by Docker, Inc. All the images (that is to
  say, the image *data*) in a given repository are hosted by a single registry.
- repository tags: A repository typically tags a set of its images with
  short names, e.g. "2.7" in "library/mongo:2.7". Tags are commonly used in
  the docker CLI when running containers. If a tag isn't specified the "latest"
  tag is implied -- note that "latest" isn't necessarily the *latest* image.
  Which image id a tag points to can change over time. The repository tags
  mapping lives in the registry.
- image ids: A globally unique 64-char hex string identifying a particular
  image, e.g. "3ce54e911389a2b08207b0a4d01c3131ce01b617ecc1c248f6d81ffdbebd628d".
  Typically this is abbreviated in client usage to 12 chars: "3ce54e911389".
- layers: I'm using "layer" and "image" interchangeably.  Images are built up
  in layers.  Each image has a parent, until the base layer. This chain
  forms the "history" (see `docker history <image>`), aka "ancestry"
  (see <https://docs.docker.com/reference/api/registry_api/#get-image-ancestry>).
  With Docker Registry API v2 these won't be interchangeable in the
  registry implementation, but for compat with older Docker the separate ID
  for each layer remains.

Some relevant links:

- <https://docs.docker.com/reference/api/hub_registry_spec/>
- <https://docs.docker.com/reference/api/registry_api/>
- <https://docs.docker.com/reference/api/docker-io_api/>


## Names

Most usage of this package involves creating a Registry client and calling
its methods. A Registry client requires a repository name:

    [INDEX/]NAME                # a "repo name"

Examples:

    mongo                       # implies default index (docker.io) and namespace (library)
    docker.io/mongo             # same thing
    docker.io/library/mongo     # same thing

    myreg.example.com:5000/busybox   # a "busybox" repo on a private registry

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


## Registry client

Typically:

    var client = drc.createClient({
        name: name,
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


See "examples/" for example usage of all (most?) of the API.


## Dev Notes

For naming this package attempts to consistently use `repo` for repository,
`img` for image, etc.
