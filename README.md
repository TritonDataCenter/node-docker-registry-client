# node-docker-registry-client

A docker registry client for node.js.
*Warning:* this is beta.
Limitation: Only some of the methods of each API are implemented.

tl;dr: See the [Registry session](#registry-session) section below.


## Intro

The "Docker Regsitry" docs are a somewhat confusing affair currently.
There are two APIs in play: the Index API (sometimes called the "Hub API")
and the Registry API. There are a few auth-related endpoints and headers.
"Image" is commonly used when referring to a repo. "The Registry" is
often used when referring to the docker Hub/Index.

There is a single global index managed by Docker, Inc:
<https://index.docker.io>, for which <https://hub.docker.com> is a web front
end. Then there can be any number of registries. Currently the one
managed by Docker, Inc. is at <https://registry-1.docker.io>.

Working with Docker images involves the following types of things:

- index: The central place to find where a given repository of images is hosted
  (i.e. what Registry API holds the image data).
- repositories: Images are grouped into named `repos`, e.g.
  ["google/python"](https://registry.hub.docker.com/u/google/python/),
  ["library/mongo"](https://registry.hub.docker.com/u/library/mongo/).
  Repos in the "library" `namespace` are official repos managed by Docker, Inc.
  All the images (that is to say, the image *data*) in a given repository
  are hosted by a single registry.
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

Some relevant links:

- <https://docs.docker.com/reference/api/hub_registry_spec/>
- <https://docs.docker.com/reference/api/registry_api/>
- <https://docs.docker.com/reference/api/docker-io_api/>


## Index client

When you want to talk directly to the [Index
API](https://docs.docker.com/reference/api/docker-io_api/).

```javascript
var docker = require('docker-registry-client');
var idx = docker.createIndexClient();  // defaults to https://index.docker.io
idx.listRepoImgs({repo: 'library/mongo'}, function (err, imgs, res) {
    console.log('imgs:', imgs)
    console.log('headers:', res.headers)
});
```

See [the source](./lib/index-client.js) for more details.


## Registry client

When you want to talk to unauthenticated endpoints of the
[Registry API](https://docs.docker.com/reference/api/registry_api/).

```javascript
var docker = require('docker-registry-client');
var reg = docker.createRegistryClient();  // default https://registry-1.docker.io
reg.getStatus(function (err, body, res) {
    console.log('status:', body);
    console.log('HTTP status:', res.statusCode);
});
```

See [the source](./lib/registry-client.js) for more details.

Note: Typical usage of the registry API is via a session as most endpoints
require an authorization token. See the "Registry session" section below.


## Registry session

When you want to talk to *authenticated* endpoints of the
[Registry API](https://docs.docker.com/reference/api/registry_api/).
Dev Note: This attempts to conform loosely to [session.go in docker
core](https://github.com/docker/docker/blob/master/registry/session.go).

```javascript
var docker = require('docker-registry-client');

// Creation of a session involves requesting a token from index.docker.io
// and getting the registry endpoint URL from that response.
docker.createRegistrySession({repo: 'library/mongo'}, function (err, session) {
    session.listRepoTags(function (err, tags) {
        console.log('mongo image tags:', tags)
    })
});
```

See [the source](./lib/registry-client.js) for more details.



## Open Questions

- Am I bastardizing the term "image" by calling each layer an image? Is it only
  an "image" in Docker-land if it has a tag associated with it?

- What are the validation rules for: repo namespaces, repo names, tags?

- Why each of these auth endpoints?

    - <https://docs.docker.com/reference/api/docker-io_api/#authorize-a-token-for-a-user-repository>
    - X-Docker-Token:true to this endpoint: <https://docs.docker.com/reference/api/docker-io_api/#list-library-repository-images>
      per discussion at <https://docs.docker.com/reference/api/hub_registry_spec/#pull>

    - <https://docs.docker.com/reference/api/docker-io_api/#user-login>


## Dev Notes

For naming this package attempts to consistently use `repo` for repository, `img` for
image, etc.
