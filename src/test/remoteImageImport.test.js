/* global Response */

import { describe, expect, it, vi } from "vitest";
import { assertPublicRemoteUrl, downloadRemoteImage, MAX_REMOTE_IMAGE_BYTES } from "../../api/_remoteImageImport.js";
import importImageUrlHandler from "../../api/workspace/import-image-url.js";

const publicLookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);

describe("remote image import security", () => {
  it.each([
    "http://localhost/image.png",
    "http://127.0.0.1/image.png",
    "http://10.0.0.1/image.png",
    "http://172.16.0.1/image.png",
    "http://192.168.1.1/image.png",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/image.png",
  ])("blocks local, private, and metadata URL %s", async (url) => {
    await expect(assertPublicRemoteUrl(url, publicLookup)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("blocks a public hostname when DNS resolves it to a private address", async () => {
    const privateLookup = vi.fn(async () => [{ address: "10.0.0.8", family: 4 }]);

    await expect(assertPublicRemoteUrl("https://images.example.com/a.png", privateLookup))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("revalidates a redirect target before following it", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/private.png" } }));

    await expect(downloadRemoteImage("https://example.com/image.png", "image", { fetchImpl, lookupImpl: publicLookup }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects images declared above 10MB", async () => {
    const fetchImpl = vi.fn(async () => new Response("x", {
      status: 200,
      headers: { "Content-Type": "image/png", "Content-Length": String(MAX_REMOTE_IMAGE_BYTES + 1) },
    }));

    await expect(downloadRemoteImage("https://example.com/large.png", "large", { fetchImpl, lookupImpl: publicLookup }))
      .rejects.toMatchObject({ statusCode: 413 });
  });

  it("stops a streamed image that exceeds 10MB without a content-length header", async () => {
    const oversized = new Uint8Array(MAX_REMOTE_IMAGE_BYTES + 1);
    const fetchImpl = vi.fn(async () => new Response(oversized, {
      status: 200,
      headers: { "Content-Type": "image/webp" },
    }));

    await expect(downloadRemoteImage("https://example.com/large.webp", "large", { fetchImpl, lookupImpl: publicLookup }))
      .rejects.toMatchObject({ statusCode: 413 });
  });

  it("rejects a non-image content type", async () => {
    const fetchImpl = vi.fn(async () => new Response("html", { status: 200, headers: { "Content-Type": "text/html" } }));

    await expect(downloadRemoteImage("https://example.com/page", "page", { fetchImpl, lookupImpl: publicLookup }))
      .rejects.toMatchObject({ statusCode: 415 });
  });

  it("requires an authenticated user before downloading", async () => {
    const response = createResponse();

    await importImageUrlHandler({ method: "POST", headers: {} }, response);

    expect(response.statusCode).toBe(401);
  });
});

function createResponse() {
  return {
    statusCode: 0,
    body: undefined,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
