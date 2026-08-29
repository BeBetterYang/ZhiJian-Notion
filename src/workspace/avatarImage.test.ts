import { afterEach, describe, expect, it, vi } from "vitest";
import { compressAvatarFile } from "./avatarImage";

function pngFile(type = "image/png") {
  return new File([new Uint8Array([1, 2, 3])], "avatar.png", { type });
}

function stubDecoder(width: number, height: number) {
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width, height, close })));
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function toDataURL(this: HTMLCanvasElement) {
    return `data:image/webp;base64,${this.width}x${this.height}`;
  });
  return { close, drawImage };
}

describe("头像压缩", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("把长边缩到 256 并保持比例", async () => {
    stubDecoder(1024, 512);

    await expect(compressAvatarFile(pngFile())).resolves.toBe("data:image/webp;base64,256x128");
  });

  it("不放大本来就很小的图片", async () => {
    stubDecoder(48, 32);

    await expect(compressAvatarFile(pngFile())).resolves.toBe("data:image/webp;base64,48x32");
  });

  it("释放解码出来的位图", async () => {
    const { close } = stubDecoder(64, 64);

    await compressAvatarFile(pngFile());

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("拒绝不是图片的文件", async () => {
    const decoder = vi.fn();
    vi.stubGlobal("createImageBitmap", decoder);

    await expect(compressAvatarFile(pngFile("application/pdf"))).rejects.toThrow("头像只支持");
    expect(decoder).not.toHaveBeenCalled();
  });
});
