import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { objects, signObjectURL } = vi.hoisted(() => ({
  objects: { getObjectEntityFile: vi.fn(), getTicketCompletionPhotoFile: vi.fn(), getPrivateObjectDir: () => '/bucket/private' },
  signObjectURL: vi.fn().mockResolvedValue('https://storage.example.test/preview'),
}));
vi.mock('../../objectStorage', () => ({
  ObjectStorageService: class { constructor() { return objects; } }, ObjectNotFoundError: class extends Error {}, signObjectURL,
}));
import { completionPhotoUrls, serveCompletionPhoto } from './completionPhotoUrls';
import { ObjectNotFoundError } from '../../objectStorage';

const filename = '73ea9bb3-e1d0-45b5-8ba0-14dcb76dafbe.png';
const owner = { companyId: 'company', id: 'owner' };
const key = `/bucket/private/visit-photos/company/owner/${filename}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ioAAAAASUVORK5CYII=', 'base64');
const metadata = { generation: '1234567', contentType: 'image/png', size: png.length };
function fixture() {
  const version = { getMetadata: vi.fn().mockResolvedValue([metadata]), download: vi.fn().mockResolvedValue([png.subarray(0, 8)]),
    createReadStream: () => Readable.from([png]) };
  return { version, file: { name: `visit-photos/company/owner/${filename}`,
    bucket: { name: 'bucket', file: vi.fn().mockReturnValue(version) }, getMetadata: vi.fn().mockResolvedValue([metadata]) } };
}
function api() { const app = express(); app.get('/email-img/:token', serveCompletionPhoto); return request(app); }
const issue = async () => new URL((await completionPhotoUrls('campaign', { ...owner, completionPhotoStorageKeys: [key] }, 'send'))[0]).pathname;

beforeEach(() => { vi.stubEnv('SESSION_SECRET', 'test-only-key'); vi.stubEnv('PUBLIC_APP_URL', 'https://app.example.test'); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllEnvs());

describe('completion email images', () => {
  it('streams valid bytes without a session and pins the signed generation', async () => {
    const { file } = fixture(); objects.getObjectEntityFile.mockResolvedValue(file);
    const url = await issue();
    const result = await api().get(url);
    expect(result.status).toBe(200);
    expect(result.body).toEqual(png);
    expect(result.headers['content-type']).toBe('image/png');
    expect(result.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(result.headers['x-content-type-options']).toBe('nosniff');
    expect(file.bucket.file).toHaveBeenCalledWith(file.name, { generation: metadata.generation });
    expect((await api().head(url)).headers['content-length']).toBe(String(png.length));
    const tampered = await api().get(url.replace(/\.(.)/, (_, ch: string) => `.${ch === 'a' ? 'b' : 'a'}`));
    expect(tampered.status).toBe(404);
    expect(tampered.headers['cache-control']).toBe('no-store');
  });

  it('only issues for attached campaign and ticket namespaces, not arbitrary or foreign objects', async () => {
    const { file } = fixture(); objects.getObjectEntityFile.mockResolvedValue(file);
    objects.getTicketCompletionPhotoFile.mockReturnValue(file);
    const invalid = ['uploads', 'flags', 'label-pdfs', 'estimate-version-photos', 'documents'].map(dir => `/bucket/private/${dir}/company/owner/${filename}`);
    invalid.push(key.replace('company/', 'foreign/'), key.replace('owner/', 'foreign/'), key.replace('/bucket/', '/other/'), key.replace('.png', '.svg'));
    expect(await completionPhotoUrls('campaign', { ...owner, completionPhotoStorageKeys: invalid }, 'send')).toEqual([]);
    expect(objects.getObjectEntityFile).not.toHaveBeenCalled();
    const ticket = `ticket-photos/company/owner/${filename}`;
    const [url] = await completionPhotoUrls('ticket', { ...owner, completionPhotoStorageKeys: [ticket, key] }, 'send');
    expect((await api().get(new URL(url).pathname)).status).toBe(200);
    expect(objects.getTicketCompletionPhotoFile).toHaveBeenCalledWith(ticket);
  });

  it('rejects even signed references with unknown scopes, and rejects missing or non-image bytes', async () => {
    const { file, version } = fixture(); objects.getObjectEntityFile.mockResolvedValue(file);
    const path = await issue();
    const payload = Buffer.from(JSON.stringify({ ...owner, filename, generation: metadata.generation, kind: 'uploads' })).toString('base64url');
    const proof = createHmac('sha256', 'test-only-key').update(`email-completion-photo:v1:${payload}`).digest('base64url');
    expect((await api().get(`/email-img/${payload}.${proof}`)).status).toBe(404);
    version.download.mockResolvedValueOnce([Buffer.from('<svg onload=')]);
    expect((await api().get(path)).status).toBe(404);
    version.getMetadata.mockResolvedValueOnce([{ ...metadata, contentType: 'application/pdf' }]);
    expect((await api().get(path)).status).toBe(404);
    objects.getObjectEntityFile.mockRejectedValueOnce(new ObjectNotFoundError());
    expect((await api().get(path)).status).toBe(404);
  });

  it('does not issue non-expiring links just by previewing', async () => {
    objects.getObjectEntityFile.mockResolvedValue(fixture().file);
    expect(await completionPhotoUrls('campaign', { ...owner, completionPhotoStorageKeys: [key] }, 'preview'))
      .toEqual(['https://storage.example.test/preview']);
    expect(signObjectURL).toHaveBeenCalledWith(expect.objectContaining({ ttlSec: 900, method: 'GET' }));
  });

  it('does not issue a durable link for mislabeled non-image bytes', async () => {
    const { file, version } = fixture();
    version.download.mockResolvedValueOnce([Buffer.from('%PDF-1.7')]);
    objects.getObjectEntityFile.mockResolvedValue(file);
    expect(await completionPhotoUrls('campaign', { ...owner, completionPhotoStorageKeys: [key] }, 'send')).toEqual([]);
  });
});
