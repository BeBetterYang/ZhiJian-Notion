/* global AbortController, Buffer, URL, fetch, setTimeout, clearTimeout */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["image/avif", ".avif"],
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function downloadRemoteImage(rawUrl, preferredName, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookupImpl = options.lookupImpl ?? lookup;
  let currentUrl = parseRemoteUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicRemoteUrl(currentUrl, lookupImpl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const response = await fetchImpl(currentUrl, { redirect: "manual", signal: controller.signal });
      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirectCount === MAX_REDIRECTS) throw statusError("外部图片重定向次数过多。", 400);
        const location = response.headers.get("location");
        if (!location) throw statusError("外部图片重定向地址无效。", 400);
        await response.body?.cancel();
        currentUrl = parseRemoteUrl(new URL(location, currentUrl).toString());
        continue;
      }
      if (!response.ok) throw statusError(`外部图片下载失败（${response.status}）。`, 502);

      const mimeType = String(response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const extension = IMAGE_EXTENSIONS.get(mimeType);
      if (!extension) throw statusError("外部地址返回的不是支持的图片格式。", 415);
      const bytes = await readLimitedBody(response, MAX_REMOTE_IMAGE_BYTES);
      if (!bytes.length) throw statusError("外部图片内容为空。", 400);
      return {
        bytes,
        mimeType,
        extension,
        fileName: remoteImageFileName(currentUrl, preferredName, extension),
      };
    } catch (error) {
      if (error?.statusCode) throw error;
      throw statusError("无法下载外部图片。", 502);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw statusError("外部图片重定向次数过多。", 400);
}

export async function assertPublicRemoteUrl(value, lookupImpl = lookup) {
  const url = value instanceof URL ? value : parseRemoteUrl(value);
  const hostname = stripIpv6Brackets(url.hostname).toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname === "metadata" || hostname === "metadata.google.internal") {
    throw statusError("不允许访问本机或内网图片地址。", 400);
  }
  const literalFamily = isIP(hostname);
  let addresses;
  try {
    addresses = literalFamily
      ? [{ address: hostname, family: literalFamily }]
      : await lookupImpl(hostname, { all: true, verbatim: true });
  } catch {
    throw statusError("外部图片地址无法解析。", 400);
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw statusError("不允许访问本机或内网图片地址。", 400);
  }
  return url;
}

function parseRemoteUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw statusError("外部图片地址无效。", 400);
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw statusError("仅支持公开的 HTTP/HTTPS 图片地址。", 400);
  }
  return url;
}

async function readLimitedBody(response, maxBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw statusError("外部图片不能超过 10MB。", 413);
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw statusError("外部图片不能超过 10MB。", 413);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function remoteImageFileName(url, preferredName, extension) {
  const preferred = typeof preferredName === "string" ? preferredName.trim() : "";
  const pathName = decodePathName(url.pathname.split("/").at(-1) ?? "");
  let fileName = (preferred || pathName || `image${extension}`)
    .replace(/[\\/\0]/g, "_")
    .slice(0, 180);
  if (!/\.[a-z0-9]{1,8}$/i.test(fileName)) fileName += extension;
  return fileName;
}

function decodePathName(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function isPublicAddress(rawAddress) {
  const address = stripIpv6Brackets(String(rawAddress)).toLowerCase();
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family !== 6) return false;
  if (address === "::" || address === "::1" || address.startsWith("::ffff:")) return false;
  const first = Number.parseInt(address.split(":")[0] || "0", 16);
  return (first & 0xfe00) !== 0xfc00 && (first & 0xffc0) !== 0xfe80 && (first & 0xff00) !== 0xff00;
}

function isPublicIpv4(address) {
  const octets = address.split(".").map(Number);
  const [a, b, c] = octets;
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function stripIpv6Brackets(value) {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}

function statusError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
