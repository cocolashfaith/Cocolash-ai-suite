import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as supabaseServer from "@/lib/supabase/server";
import * as enhancorImage from "@/lib/image-processing/enhancor-image";
import { POST as SIGN } from "@/app/api/video-inputs/sign/route";
import { POST as UPLOAD } from "@/app/api/video-inputs/upload/route";
import { GET as VIDEO_INPUTS } from "@/app/api/videos/inputs/route";

/**
 * Package C — the two upload routes (D6) + "From your videos".
 *
 * Vercel caps route-handler bodies at ~4.5 MB, so a 50 MB clip can only reach
 * Storage through a signed upload URL minted here; the multipart route exists
 * for images, which must be transcoded to PNG/JPEG server-side before Enhancor
 * ever sees them.
 */

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/image-processing/enhancor-image");

const PUBLIC_BASE =
  "https://exkdmmxbrsgefpciyqkz.supabase.co/storage/v1/object/public/video-inputs";

interface StorageStub {
  createSignedUploadUrl: ReturnType<typeof vi.fn>;
  upload: ReturnType<typeof vi.fn>;
  getPublicUrl: ReturnType<typeof vi.fn>;
}

let storage: StorageStub;
let fromBucket: ReturnType<typeof vi.fn>;

function mockStorage(overrides: Partial<StorageStub> = {}): void {
  storage = {
    createSignedUploadUrl: vi.fn().mockResolvedValue({
      data: { path: "video/2026/09/x.mp4", token: "tok-123", signedUrl: "https://signed" },
      error: null,
    }),
    upload: vi.fn().mockResolvedValue({ data: { path: "image/2026/09/x.png" }, error: null }),
    getPublicUrl: vi.fn((p: string) => ({ data: { publicUrl: `${PUBLIC_BASE}/${p}` } })),
    ...overrides,
  };
  fromBucket = vi.fn(() => storage);
  vi.mocked(supabaseServer.createAdminClient).mockResolvedValue({
    storage: { from: fromBucket },
  } as never);
}

function signReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/video-inputs/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function uploadReq(form: FormData | null): NextRequest {
  if (!form) {
    return new NextRequest("http://localhost/api/video-inputs/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nope: true }),
    });
  }
  return new NextRequest("http://localhost/api/video-inputs/upload", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/video-inputs/sign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage();
  });

  it("mints a signed upload URL for a 30 MB mp4", async () => {
    const res = await SIGN(
      signReq({
        kind: "video",
        filename: "clip.mp4",
        contentType: "video/mp4",
        size: 30 * 1024 * 1024,
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.path).toMatch(/^video\/\d{4}\/\d{2}\/[0-9a-f-]+\.mp4$/);
    expect(data.token).toBe("tok-123");
    expect(data.signedUrl).toBe("https://signed");
    expect(data.publicUrl).toBe(`${PUBLIC_BASE}/${data.path}`);
    expect(data.kind).toBe("video");
    expect(data.contentType).toBe("video/mp4");
    expect(fromBucket).toHaveBeenCalledWith("video-inputs");
  });

  it("rejects a MIME the bucket does not allow (400, no storage call)", async () => {
    const res = await SIGN(
      signReq({
        kind: "video",
        filename: "old.avi",
        contentType: "video/x-msvideo",
        size: 1024,
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects 51 MB with 400", async () => {
    const res = await SIGN(
      signReq({
        kind: "video",
        filename: "big.mp4",
        contentType: "video/mp4",
        size: 51 * 1024 * 1024,
      })
    );
    expect(res.status).toBe(400);
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with 400", async () => {
    const res = await SIGN(signReq({ kind: "hologram", filename: 5 }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when Storage refuses to mint a token", async () => {
    mockStorage({
      createSignedUploadUrl: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "nope" } }),
    });
    const res = await SIGN(
      signReq({
        kind: "audio",
        filename: "vo.mp3",
        contentType: "audio/mpeg",
        size: 2048,
      })
    );
    expect(res.status).toBe(500);
  });
});

describe("POST /api/video-inputs/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage();
    vi.mocked(enhancorImage.toEnhancorCompatibleImage).mockImplementation(
      async () => new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" })
    );
  });

  it("rejects a non-multipart request with 400", async () => {
    const res = await UPLOAD(uploadReq(null));
    expect(res.status).toBe(400);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("transcodes a webp image and uploads it to video-inputs as PNG", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([9, 9, 9, 9])], "shot.webp", { type: "image/webp" })
    );
    form.append("kind", "image");

    const res = await UPLOAD(uploadReq(form));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(enhancorImage.toEnhancorCompatibleImage).toHaveBeenCalledTimes(1);
    expect(fromBucket).toHaveBeenCalledWith("video-inputs");
    expect(data.kind).toBe("image");
    expect(data.contentType).toBe("image/png");
    expect(data.path).toMatch(/^image\/\d{4}\/\d{2}\/[0-9a-f-]+\.png$/);
    expect(data.url).toBe(`${PUBLIC_BASE}/${data.path}`);

    const [uploadPath, , opts] = storage.upload.mock.calls[0];
    expect(uploadPath).toBe(data.path);
    expect(opts).toMatchObject({ contentType: "image/png", upsert: false });
  });

  it("derives the kind from the MIME when the field is missing", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([1])], "shot.png", { type: "image/png" })
    );
    const res = await UPLOAD(uploadReq(form));
    expect(res.status).toBe(200);
    expect((await res.json()).kind).toBe("image");
  });

  it("rejects a 10.1 MB image with 400", async () => {
    const form = new FormData();
    const big = new File([new Uint8Array(Math.round(10.1 * 1024 * 1024))], "huge.png", {
      type: "image/png",
    });
    form.append("file", big);
    form.append("kind", "image");
    const res = await UPLOAD(uploadReq(form));
    expect(res.status).toBe(400);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejects an unsupported MIME with 400 and never calls sharp", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1])], "a.gif", { type: "image/gif" }));
    const res = await UPLOAD(uploadReq(form));
    expect(res.status).toBe(400);
    expect(enhancorImage.toEnhancorCompatibleImage).not.toHaveBeenCalled();
  });

  it("returns 500 when the storage upload fails", async () => {
    mockStorage({
      upload: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
    });
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1])], "a.png", { type: "image/png" }));
    const res = await UPLOAD(uploadReq(form));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/videos/inputs", () => {
  const rows = [
    {
      id: "a",
      pipeline: "seedance",
      engine: "2.5",
      seedance_mode: "ugc",
      heygen_status: "completed",
      duration_seconds: 8,
      created_at: "2026-09-01T00:00:00.000Z",
      thumbnail_url: null,
      final_video_url:
        "https://res.cloudinary.com/dyianrt0w/video/upload/v1/a.mp4",
      raw_video_url: "https://d2i9jqncnkplwq.cloudfront.net/videos/a.mp4",
    },
    {
      // dead Cloudinary final → must fall back to the CloudFront raw
      id: "b",
      pipeline: "seedance",
      heygen_status: "completed",
      duration_seconds: 8,
      created_at: "2026-08-01T00:00:00.000Z",
      thumbnail_url: null,
      final_video_url:
        "https://res.cloudinary.com/dtnvppaty/video/upload/v1/b.mp4",
      raw_video_url: "https://d2i9jqncnkplwq.cloudfront.net/videos/b.mp4",
    },
    {
      // nothing playable → dropped entirely
      id: "c",
      pipeline: "heygen",
      heygen_status: "completed",
      duration_seconds: 8,
      created_at: "2026-07-01T00:00:00.000Z",
      thumbnail_url: null,
      final_video_url: null,
      raw_video_url: "https://files2.heygen.ai/x.mp4?Expires=1",
    },
  ];

  let builder: Record<string, ReturnType<typeof vi.fn>>;

  function mockQuery(result: { data: unknown; error: unknown }): void {
    builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => Promise.resolve(result)),
    } as never;
    vi.mocked(supabaseServer.createAdminClient).mockResolvedValue({
      from: vi.fn(() => builder),
    } as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only completed rows with a live URL, dead cloud excluded", async () => {
    mockQuery({ data: rows, error: null });
    const res = await VIDEO_INPUTS(
      new NextRequest("http://localhost/api/videos/inputs")
    );
    expect(res.status).toBe(200);
    const { videos } = await res.json();
    expect(videos.map((v: { id: string }) => v.id)).toEqual(["a", "b"]);
    expect(videos[1].url).toBe("https://d2i9jqncnkplwq.cloudfront.net/videos/b.mp4");
    expect(JSON.stringify(videos)).not.toContain("dtnvppaty");
    expect(builder.eq).toHaveBeenCalledWith("heygen_status", "completed");
    // select("*") so the route still works before the 2.5 migration lands
    expect(builder.select).toHaveBeenCalledWith("*");
  });

  it("honours ?limit and caps it at 100", async () => {
    mockQuery({ data: rows, error: null });
    const res = await VIDEO_INPUTS(
      new NextRequest("http://localhost/api/videos/inputs?limit=1")
    );
    const { videos } = await res.json();
    expect(videos).toHaveLength(1);
    expect(videos[0].id).toBe("a");
  });

  it("returns 500 when the query fails", async () => {
    mockQuery({ data: null, error: { message: "db down" } });
    const res = await VIDEO_INPUTS(
      new NextRequest("http://localhost/api/videos/inputs")
    );
    expect(res.status).toBe(500);
  });
});
