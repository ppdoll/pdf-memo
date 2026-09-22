import 'fake-indexeddb/auto';
import { ROOT_FOLDER_ID, documentKind } from '@pdf-memo/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DexieStorage } from '../../../../storage/dexie/DexieStorage';
import { importJsonFile } from '../importJson';

let storage: DexieStorage;

beforeEach(() => {
  storage = new DexieStorage(`json-${Math.random().toString(36).slice(2)}`);
});

afterEach(async () => {
  await storage.destroy();
});

const jsonFile = (name: string, text: string) =>
  new File([text], name, { type: 'application/json' });

describe('importJsonFile', () => {
  it('stores valid JSON as a json document with the raw bytes', async () => {
    const file = jsonFile('레시피.json', '{"name":"김치볶음밥","servings":2}');
    const stages: string[] = [];
    const outcome = await importJsonFile(file, {
      storage,
      folderId: ROOT_FOLDER_ID,
      onStage: (s) => stages.push(s),
    });
    expect(outcome.status).toBe('done');
    if (outcome.status !== 'done') return;
    const doc = await storage.documents.get(outcome.documentId);
    expect(doc).toBeDefined();
    expect(documentKind(doc!)).toBe('json');
    expect(doc!.title).toBe('레시피');
    expect(doc!.originalFileName).toBe('레시피.json');
    expect(doc!.pageCount).toBe(1);
    const blob = await storage.blobs.get(doc!.blobHash);
    expect(await blob!.text()).toBe('{"name":"김치볶음밥","servings":2}');
    expect(stages).toEqual(['analyzing', 'hashing', 'saving']);
  });

  it('rejects invalid JSON with a readable message and does not store anything', async () => {
    const outcome = await importJsonFile(jsonFile('bad.json', '{"a": }'), {
      storage,
      folderId: ROOT_FOLDER_ID,
    });
    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') expect(outcome.message).toMatch(/JSON/);
    expect(await storage.documents.all()).toHaveLength(0);
  });

  it('reports duplicates by content hash and rejects non-json files', async () => {
    const text = '[1,2,3]';
    const first = await importJsonFile(jsonFile('a.json', text), {
      storage,
      folderId: ROOT_FOLDER_ID,
    });
    const second = await importJsonFile(jsonFile('b.json', text), {
      storage,
      folderId: ROOT_FOLDER_ID,
    });
    expect(first.status).toBe('done');
    expect(second.status).toBe('duplicate');
    if (second.status === 'duplicate') expect(second.existingTitle).toBe('a');

    const notJson = await importJsonFile(new File(['x'], 'a.txt', { type: 'text/plain' }), {
      storage,
      folderId: ROOT_FOLDER_ID,
    });
    expect(notJson.status).toBe('error');
    const tooBig = await importJsonFile(jsonFile('big.json', '[1]'), {
      storage,
      folderId: ROOT_FOLDER_ID,
      maxBytes: 1,
    });
    expect(tooBig.status).toBe('error');
  });
});
