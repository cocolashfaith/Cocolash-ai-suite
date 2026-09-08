import { describe, it, expect } from "vitest";
import {
  EXT_BY_MIME,
  IMAGE_INPUT_MAX_BYTES,
  buildVideoInputPath,
  kindForMime,
  sanitizeFilename,
  validateVideoInput,
} from "@/lib/video-inputs/validation";
import {
  VIDEO_INPUTS_ALLOWED_MIME,
  VIDEO_INPUTS_MAX_BYTES,
} from "@/lib/supabase/storage";

/**
 * Package C — pure validation for the `video-inputs` bucket (D6).
 *
 * Both upload paths (signed URL for video/audio, multipart route for images)
 * re-validate server-side with these helpers, so the MIME/kind/size matrix and
 * the storage path shape are locked here.
 */

const MB = 1024 * 1024;

describe("kindForMime", () => {
  it("classifies every allowed MIME into exactly one kind", () => {
    for (const mime of VIDEO_INPUTS_ALLOWED_MIME) {
      const kind = kindForMime(mime);
      expect(kind, mime).not.toBeNull();
      expect(mime.startsWith(`${kind}/`)).toBe(true);
    }
  });

  it("returns null for MIME types the bucket does not accept", () => {
    expect(kindForMime("image/gif")).toBeNull();
    expect(kindForMime("image/avif")).toBeNull();
    expect(kindForMime("application/pdf")).toBeNull();
    expect(kindForMime("")).toBeNull();
    expect(kindForMime("video/x-msvideo")).toBeNull();
  });

  it("is case- and parameter-insensitive", () => {
    expect(kindForMime("VIDEO/MP4")).toBe("video");
    expect(kindForMime("audio/mpeg; codecs=mp3")).toBe("audio");
  });
});

describe("EXT_BY_MIME", () => {
  it("has an extension for every allowed MIME", () => {
    for (const mime of VIDEO_INPUTS_ALLOWED_MIME) {
      expect(EXT_BY_MIME[mime], mime).toBeTruthy();
      expect(EXT_BY_MIME[mime]).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("maps the common aliases onto one canonical extension", () => {
    expect(EXT_BY_MIME["audio/mpeg"]).toBe("mp3");
    expect(EXT_BY_MIME["audio/mp3"]).toBe("mp3");
    expect(EXT_BY_MIME["audio/x-wav"]).toBe("wav");
    expect(EXT_BY_MIME["video/quicktime"]).toBe("mov");
    expect(EXT_BY_MIME["image/jpeg"]).toBe("jpg");
  });
});

describe("validateVideoInput", () => {
  it("accepts a 30 MB mp4 as a video", () => {
    const res = validateVideoInput({
      kind: "video",
      contentType: "video/mp4",
      size: 30 * MB,
      filename: "clip.mp4",
    });
    expect(res).toEqual({ ok: true, ext: "mp4" });
  });

  it("accepts image/webp (the upload route transcodes it later)", () => {
    const res = validateVideoInput({
      kind: "image",
      contentType: "image/webp",
      size: 2 * MB,
      filename: "shot.webp",
    });
    expect(res.ok).toBe(true);
  });

  it("accepts wav/m4a/flac audio", () => {
    for (const mime of ["audio/wav", "audio/x-m4a", "audio/flac"]) {
      const res = validateVideoInput({
        kind: "audio",
        contentType: mime,
        size: 5 * MB,
        filename: `vo.${EXT_BY_MIME[mime]}`,
      });
      expect(res.ok, mime).toBe(true);
    }
  });

  it("rejects a MIME outside the bucket allow-list", () => {
    const res = validateVideoInput({
      kind: "video",
      contentType: "video/x-msvideo",
      size: 1 * MB,
      filename: "old.avi",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not supported|unsupported/i);
  });

  it("rejects a kind that disagrees with the MIME family", () => {
    const res = validateVideoInput({
      kind: "audio",
      contentType: "video/mp4",
      size: 1 * MB,
      filename: "clip.mp4",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/audio/i);
  });

  it("rejects 51 MB of video (bucket cap is 50 MB)", () => {
    const res = validateVideoInput({
      kind: "video",
      contentType: "video/mp4",
      size: 51 * MB,
      filename: "big.mp4",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/50 MB/);
    expect(VIDEO_INPUTS_MAX_BYTES).toBe(50 * MB);
  });

  it("rejects a 10.1 MB image (images are capped tighter than the bucket)", () => {
    const res = validateVideoInput({
      kind: "image",
      contentType: "image/png",
      size: Math.round(10.1 * MB),
      filename: "huge.png",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/10 MB/);
    expect(IMAGE_INPUT_MAX_BYTES).toBe(10 * MB);
  });

  it("rejects a zero-byte or negative size", () => {
    expect(
      validateVideoInput({ kind: "video", contentType: "video/mp4", size: 0 }).ok
    ).toBe(false);
    expect(
      validateVideoInput({ kind: "video", contentType: "video/mp4", size: -1 }).ok
    ).toBe(false);
  });

  it("rejects a non-finite size", () => {
    expect(
      validateVideoInput({
        kind: "video",
        contentType: "video/mp4",
        size: Number.NaN,
      }).ok
    ).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("strips directories, control chars and keeps a readable basename", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("my clip (final).mp4")).toBe("my_clip_final_.mp4");
    expect(sanitizeFilename("")).toBe("upload");
  });

  it("caps very long names", () => {
    expect(sanitizeFilename("a".repeat(300) + ".mp4").length).toBeLessThanOrEqual(
      120
    );
  });
});

describe("buildVideoInputPath", () => {
  it("produces kind/YYYY/MM/<uuid>.<ext>", () => {
    const path = buildVideoInputPath("video", "mp4", new Date("2026-09-08T10:00:00Z"));
    expect(path).toMatch(
      /^video\/2026\/09\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/
    );
  });

  it("uses the kind as the top-level prefix", () => {
    expect(buildVideoInputPath("audio", "mp3", new Date("2026-01-02T00:00:00Z"))).toMatch(
      /^audio\/2026\/01\//
    );
    expect(buildVideoInputPath("image", "png", new Date("2026-12-31T00:00:00Z"))).toMatch(
      /^image\/2026\/12\//
    );
  });

  it("never repeats a path", () => {
    const now = new Date("2026-09-08T10:00:00Z");
    const a = buildVideoInputPath("video", "mp4", now);
    const b = buildVideoInputPath("video", "mp4", now);
    expect(a).not.toBe(b);
  });
});
