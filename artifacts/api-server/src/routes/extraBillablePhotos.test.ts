// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock heic-convert at module level — ESM does not allow spying on default
// exports, so we install a controllable mock and tweak its implementation in
// individual tests.
const heicConvertMock = vi.fn();
vi.mock("heic-convert", () => ({ default: (...args: unknown[]) => heicConvertMock(...args) }));

import { registerExtraBillablePhotoRoutes } from "./extraBillablePhotos";

// JPEG magic bytes header — sufficient for our magic-byte sniff (FF D8 FF E0).
const JPEG_HEADER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const JPEG_BUFFER = Buffer.concat([JPEG_HEADER, Buffer.alloc(64, 0)]);

// HEIC/HEIF box: bytes 4..7 = "ftyp" — we just need the sniff to classify it
// as HEIC and route through the HEIC converter.
const HEIC_HEADER = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);
const HEIC_BUFFER = Buffer.concat([HEIC_HEADER, Buffer.alloc(64, 0)]);

const TEXT_BUFFER = Buffer.from("not an image at all, this is just text bytes");

type FakeUser = {
  id: string;
  activeRole: string;
  activeCompanyId: string;
};

function buildApp(opts: {
  user: FakeUser | null;
  campaign: Record<string, unknown> | null;
  item: Record<string, unknown> | null;
  crew?: Record<string, unknown> | null;
  members?: Array<{ campaignCrewId: string; userId: string; addedAt: Date }>;
  uploadToStorage?: ReturnType<typeof vi.fn>;
  deleteFromStorage?: ReturnType<typeof vi.fn>;
  signGetUrl?: ReturnType<typeof vi.fn>;
  updateCampaignItem?: ReturnType<typeof vi.fn>;
  processImage?: (buf: Buffer) => Promise<Buffer>;
}) {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => Boolean(opts.user);
    if (opts.user) (req as unknown as { user: FakeUser }).user = opts.user;
    next();
  });

  const storage = {
    getCampaignById: vi.fn().mockResolvedValue(opts.campaign),
    getCampaignItemById: vi.fn().mockResolvedValue(opts.item),
    getCampaignCrewById: vi.fn().mockResolvedValue(opts.crew ?? null),
    getCampaignCrewMembers: vi.fn().mockResolvedValue(opts.members ?? []),
    updateCampaignItem: opts.updateCampaignItem ?? vi.fn().mockResolvedValue(opts.item),
  };

  registerExtraBillablePhotoRoutes(app, {
    storage: storage as never,
    uploadToStorage: (opts.uploadToStorage ?? vi.fn().mockResolvedValue(undefined)) as never,
    deleteFromStorage: (opts.deleteFromStorage ?? vi.fn().mockResolvedValue(undefined)) as never,
    signGetUrl: (opts.signGetUrl ?? vi.fn().mockResolvedValue("https://signed.example/url")) as never,
    processImage: opts.processImage ?? (async (b: Buffer) => b),
    // Stable storage key shape for tests — emulates the production
    // PRIVATE_OBJECT_DIR-prefixed convention without relying on env vars.
    buildStorageKey: (companyId, itemId, filename) =>
      `test-bucket/extra-billable-photos/${companyId}/${itemId}/${filename}`,
  });

  return { app, storage };
}

const adminUser: FakeUser = { id: "admin-1", activeRole: "admin", activeCompanyId: "company-1" };
const fieldUser: FakeUser = { id: "field-1", activeRole: "field", activeCompanyId: "company-1" };
const leaderUser: FakeUser = { id: "leader-1", activeRole: "field", activeCompanyId: "company-1" };

const ebCampaign = { id: "camp-1", category: "extra_billable", companyId: "company-1" };
const baseItem = {
  id: "item-1",
  campaignId: "camp-1",
  companyId: "company-1",
  assignedCampaignCrewId: "crew-1",
  photos: [],
};
const crew = {
  id: "crew-1",
  campaignId: "camp-1",
  companyId: "company-1",
  leaderUserId: "leader-1",
  color: "#000",
  name: "Crew",
  displayOrder: 0,
};

function postRaw(app: express.Express, path: string, buf: Buffer, contentType = "image/jpeg") {
  // Raw byte upload — matches the production express.raw() contract.
  return request(app).post(path).set("Content-Type", contentType).send(buf);
}

describe("registerExtraBillablePhotoRoutes — POST /photos/drop", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated requests with 401", async () => {
    const { app } = buildApp({ user: null, campaign: ebCampaign, item: baseItem });
    const res = await postRaw(app, "/api/campaigns/camp-1/items/item-1/photos/drop", JPEG_BUFFER);
    expect(res.status).toBe(401);
  });

  it("rejects roles outside ALLOWED_ROLES with 403", async () => {
    const { app } = buildApp({
      user: { id: "u", activeRole: "customer", activeCompanyId: "company-1" },
      campaign: ebCampaign,
      item: baseItem,
    });
    const res = await postRaw(app, "/api/campaigns/camp-1/items/item-1/photos/drop", JPEG_BUFFER);
    expect(res.status).toBe(403);
  });

  it("returns 404 when campaign is not extra_billable", async () => {
    const { app } = buildApp({
      user: adminUser,
      campaign: { ...ebCampaign, category: "chemical" },
      item: baseItem,
    });
    const res = await postRaw(app, "/api/campaigns/camp-1/items/item-1/photos/drop", JPEG_BUFFER);
    expect(res.status).toBe(404);
  });

  it("returns 403 when field user is not the crew leader", async () => {
    const { app } = buildApp({
      user: fieldUser,
      campaign: ebCampaign,
      item: baseItem,
      crew,
    });
    const res = await postRaw(app, "/api/campaigns/camp-1/items/item-1/photos/drop", JPEG_BUFFER);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("extraBillablePhotoForbidden");
  });

  it("returns 415 when file bytes are not a recognized image", async () => {
    const { app } = buildApp({ user: adminUser, campaign: ebCampaign, item: baseItem, crew });
    const res = await postRaw(
      app,
      "/api/campaigns/camp-1/items/item-1/photos/drop",
      TEXT_BUFFER,
      "application/octet-stream",
    );
    expect(res.status).toBe(415);
    expect(res.body.error).toBe("extraBillablePhotoInvalidType");
  });

  it("returns 400 when the raw body is empty", async () => {
    const { app } = buildApp({ user: adminUser, campaign: ebCampaign, item: baseItem, crew });
    const res = await postRaw(app, "/api/campaigns/camp-1/items/item-1/photos/drop", Buffer.alloc(0));
    expect(res.status).toBe(400);
  });

  it("uploads JPEG, appends to photos[], stores under extra-billable-photos prefix, and returns the new key", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockResolvedValue(baseItem);
    const { app, storage } = buildApp({
      user: adminUser,
      campaign: ebCampaign,
      item: { ...baseItem, photos: ["test-bucket/extra-billable-photos/company-1/item-1/existing.jpg"] },
      crew,
      uploadToStorage: upload,
      updateCampaignItem: update,
    });
    const res = await postRaw(app, "/api/campaigns/camp-1/items/item-1/photos/drop", JPEG_BUFFER);
    expect(res.status).toBe(200);
    expect(res.body.storageKey).toMatch(
      /^test-bucket\/extra-billable-photos\/company-1\/item-1\/[0-9a-f-]+\.jpg$/,
    );
    expect(upload).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      "item-1",
      "company-1",
      expect.objectContaining({ photos: expect.arrayContaining([res.body.storageKey]) }),
    );
    expect(storage.getCampaignItemById).toHaveBeenCalledWith("item-1", "company-1");
  });

  it("converts HEIC to JPEG via heic-convert and uploads successfully", async () => {
    const convertedBytes = Buffer.concat([JPEG_HEADER, Buffer.from("converted")]);
    heicConvertMock.mockResolvedValueOnce(convertedBytes);

    const upload = vi.fn().mockResolvedValue(undefined);
    const seenBufs: Buffer[] = [];
    const { app } = buildApp({
      user: adminUser,
      campaign: ebCampaign,
      item: baseItem,
      crew,
      uploadToStorage: upload,
      processImage: async (b: Buffer) => {
        seenBufs.push(b);
        return b;
      },
    });
    const res = await postRaw(
      app,
      "/api/campaigns/camp-1/items/item-1/photos/drop",
      HEIC_BUFFER,
      "image/heic",
    );
    expect(res.status).toBe(200);
    expect(heicConvertMock).toHaveBeenCalledOnce();
    // The buffer that hit sharp was the converter output, not the raw HEIC.
    expect(seenBufs[0].slice(0, 3).equals(JPEG_HEADER.slice(0, 3))).toBe(true);
    expect(upload).toHaveBeenCalledOnce();
  });

  it("returns 422 when HEIC conversion fails", async () => {
    heicConvertMock.mockRejectedValueOnce(new Error("unsupported HEIC brand"));
    const { app } = buildApp({ user: adminUser, campaign: ebCampaign, item: baseItem, crew });
    const res = await postRaw(
      app,
      "/api/campaigns/camp-1/items/item-1/photos/drop",
      HEIC_BUFFER,
      "image/heic",
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("extraBillablePhotoUploadFailed");
  });

  it("returns 422 when sharp processing fails", async () => {
    const { app } = buildApp({
      user: adminUser,
      campaign: ebCampaign,
      item: baseItem,
      crew,
      processImage: async () => {
        throw new Error("sharp boom");
      },
    });
    const res = await postRaw(app, "/api/campaigns/camp-1/items/item-1/photos/drop", JPEG_BUFFER);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("extraBillablePhotoUploadFailed");
  });

  it("allows the crew leader (field role) to upload", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const { app } = buildApp({
      user: leaderUser,
      campaign: ebCampaign,
      item: baseItem,
      crew,
      uploadToStorage: upload,
    });
    const res = await postRaw(app, "/api/campaigns/camp-1/items/item-1/photos/drop", JPEG_BUFFER);
    expect(res.status).toBe(200);
    expect(upload).toHaveBeenCalledOnce();
  });
});

describe("registerExtraBillablePhotoRoutes — DELETE /photos/*storageKey", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects keys that do not match the per-item path segment", async () => {
    const otherKey = "test-bucket/extra-billable-photos/other-company/item-x/abc.jpg";
    const { app } = buildApp({
      user: adminUser,
      campaign: ebCampaign,
      item: { ...baseItem, photos: [otherKey] },
      crew,
    });
    const res = await request(app).delete(`/api/campaigns/camp-1/items/item-1/photos/${otherKey}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the key is not present on the item", async () => {
    const { app } = buildApp({ user: adminUser, campaign: ebCampaign, item: baseItem, crew });
    const res = await request(app).delete(
      "/api/campaigns/camp-1/items/item-1/photos/test-bucket/extra-billable-photos/company-1/item-1/missing.jpg",
    );
    expect(res.status).toBe(404);
  });

  it("removes the key from photos[] and calls deleteFromStorage", async () => {
    const key = "test-bucket/extra-billable-photos/company-1/item-1/abc.jpg";
    const del = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockResolvedValue(baseItem);
    const { app } = buildApp({
      user: adminUser,
      campaign: ebCampaign,
      item: { ...baseItem, photos: [key] },
      crew,
      deleteFromStorage: del,
      updateCampaignItem: update,
    });
    const res = await request(app).delete(`/api/campaigns/camp-1/items/item-1/photos/${key}`);
    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalledWith(key);
    expect(update).toHaveBeenCalledWith("item-1", "company-1", expect.objectContaining({ photos: [] }));
    expect(res.body.photos).toEqual([]);
  });

  it("denies non-leader field users", async () => {
    const key = "test-bucket/extra-billable-photos/company-1/item-1/abc.jpg";
    const { app } = buildApp({
      user: fieldUser,
      campaign: ebCampaign,
      item: { ...baseItem, photos: [key] },
      crew,
    });
    const res = await request(app).delete(`/api/campaigns/camp-1/items/item-1/photos/${key}`);
    expect(res.status).toBe(403);
  });
});

describe("registerExtraBillablePhotoRoutes — GET /photo-urls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns signed URLs for keys that contain the per-item path segment only", async () => {
    const good = "test-bucket/extra-billable-photos/company-1/item-1/abc.jpg";
    const bad = "test-bucket/extra-billable-photos/other/abc.jpg";
    const sign = vi.fn().mockResolvedValue("https://signed.example/url");
    const { app } = buildApp({
      user: adminUser,
      campaign: ebCampaign,
      item: { ...baseItem, photos: [good, bad] },
      crew,
      signGetUrl: sign,
    });
    const res = await request(app).get("/api/campaigns/camp-1/items/item-1/photo-urls");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].storageKey).toBe(good);
    expect(res.body[0].signedUrl).toBe("https://signed.example/url");
    // Spec: signed URLs expire after 1 hour.
    const ttlMs = new Date(res.body[0].expiresAt).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(60 * 59 * 1000);
    expect(ttlMs).toBeLessThan(60 * 61 * 1000);
    expect(sign).toHaveBeenCalledOnce();
  });

  it("allows crew members read access", async () => {
    const key = "test-bucket/extra-billable-photos/company-1/item-1/abc.jpg";
    const memberUser: FakeUser = { id: "member-1", activeRole: "field", activeCompanyId: "company-1" };
    const { app } = buildApp({
      user: memberUser,
      campaign: ebCampaign,
      item: { ...baseItem, photos: [key] },
      crew,
      members: [{ campaignCrewId: "crew-1", userId: "member-1", addedAt: new Date() }],
    });
    const res = await request(app).get("/api/campaigns/camp-1/items/item-1/photo-urls");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
