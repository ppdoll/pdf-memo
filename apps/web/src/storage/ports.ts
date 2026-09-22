import type {
  AnnotationObject,
  AssetMeta,
  BaseEntity,
  Folder,
  PdfDocument,
} from '@pdf-memo/shared';

/**
 * UI와 도메인 서비스는 이 파일의 인터페이스만 본다.
 * 1단계 구현은 IndexedDB(Dexie). 2단계에서도 이 구현은 유지되고 옆에 SyncEngine이 붙는다.
 */

export interface Subscription {
  unsubscribe(): void;
}

export interface Observer<T> {
  next: (value: T) => void;
  error?: (error: unknown) => void;
}

/** Dexie liveQuery의 Observable과 호환되는 최소 인터페이스 */
export interface Subscribable<T> {
  subscribe(observer: Observer<T>): Subscription;
}

export interface Repo<T extends BaseEntity> {
  get(id: string): Promise<T | undefined>;
  /** rev를 +1, updatedAt을 갱신하고 outbox에 기록한 뒤 저장된 엔티티를 돌려준다 */
  put(entity: T): Promise<T>;
  /** 휴지통으로 (deletedAt 설정) */
  softDelete(id: string): Promise<void>;
  /** 휴지통에서 복원 */
  restore(id: string): Promise<void>;
  /** 물리 삭제. 휴지통 비우기 */
  purge(id: string): Promise<void>;
}

export interface ListOptions {
  /** 휴지통에 있는 항목도 포함 (계단식 삭제·복원용) */
  includeTrashed?: boolean;
}

export interface FolderRepo extends Repo<Folder> {
  /** 하위 폴더, sortKey 순. 기본은 살아 있는 것만 */
  children(parentId: string, options?: ListOptions): Promise<Folder[]>;
  watchChildren(parentId: string): Subscribable<Folder[]>;
  /** 루트 직속부터 해당 폴더까지의 경로 (루트 sentinel 제외) */
  path(id: string): Promise<Folder[]>;
  /** 순환·깊이 검증을 포함한 이동 */
  move(id: string, parentId: string): Promise<Folder>;
  trashed(): Promise<Folder[]>;
  watchTrashed(): Subscribable<Folder[]>;
  /** 휴지통 포함 전체 (백업용) */
  all(): Promise<Folder[]>;
}

/** 동기화하지 않는 로컬 보기 상태 */
export interface DocumentViewState {
  lastViewedPage: number;
  lastOpenedAt: string | null;
}

export interface DocumentRepo extends Repo<PdfDocument> {
  inFolder(folderId: string, options?: ListOptions): Promise<PdfDocument[]>;
  watchInFolder(folderId: string): Subscribable<PdfDocument[]>;
  /** 최근 열어본 순. 한 번도 열지 않은 문서는 제외 */
  recent(limit: number): Promise<PdfDocument[]>;
  watchRecent(limit: number): Subscribable<PdfDocument[]>;
  /** 같은 PDF를 다시 가져오는지 감지 */
  byBlobHash(hash: string): Promise<PdfDocument[]>;
  trashed(): Promise<PdfDocument[]>;
  watchTrashed(): Subscribable<PdfDocument[]>;
  /** 보기 상태만 갱신. rev·outbox를 건드리지 않아 동기화 대상이 아니다 */
  updateViewState(id: string, patch: Partial<DocumentViewState>): Promise<void>;
  /** 휴지통 포함 전체 (백업용) */
  all(): Promise<PdfDocument[]>;
}

export interface AnnotationRepo extends Repo<AnnotationObject> {
  /** 한 페이지의 살아 있는 객체, z 순 */
  page(documentId: string, pageIndex: number): Promise<AnnotationObject[]>;
  watchPage(documentId: string, pageIndex: number): Subscribable<AnnotationObject[]>;
  forDocument(documentId: string): Promise<AnnotationObject[]>;
  /** tombstone 포함 전체 (백업·동기화용) */
  allForDocument(documentId: string): Promise<AnnotationObject[]>;
  bulkPut(objects: AnnotationObject[]): Promise<AnnotationObject[]>;
  /** 문서 물리 삭제 시 함께 지운다. 문서 tombstone이 서버에서 cascade하므로 개별 outbox 기록은 남기지 않는다 */
  purgeForDocument(documentId: string): Promise<number>;
}

export interface PdfBlobInfo {
  hash: string;
  byteSize: number;
  /** 참조하는 PdfDocument 수 (휴지통 포함). DocumentRepo가 관리한다 */
  refCount: number;
  uploadedAt: string | null;
}

export interface BlobStore {
  get(hash: string): Promise<Blob | undefined>;
  has(hash: string): Promise<boolean>;
  /** 없으면 refCount 0으로 추가. 이미 있으면 무시 */
  put(hash: string, data: Blob): Promise<void>;
  info(hash: string): Promise<PdfBlobInfo | undefined>;
  /** refCount가 0인 Blob 정리. 삭제한 개수를 돌려준다 */
  pruneOrphans(): Promise<number>;
}

export interface Asset extends AssetMeta {
  data: Blob;
}

export interface AssetStore {
  get(id: string): Promise<Asset | undefined>;
  put(asset: Asset): Promise<void>;
  list(kind: AssetMeta['kind']): Promise<Asset[]>;
  all(): Promise<Asset[]>;
  remove(id: string): Promise<void>;
}

export interface SettingEntry {
  key: string;
  value: unknown;
}

export interface SettingsStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  all(): Promise<SettingEntry[]>;
}

/** 기기 로컬 동기화 상태 (deviceId, cursor 등). 백업에 포함하지 않는다 */
export interface SyncStateStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

export type OutboxEntity = 'folder' | 'document' | 'annotation' | 'asset';

export interface OutboxEntry {
  seq: number;
  entity: OutboxEntity;
  entityId: string;
  op: 'upsert' | 'delete';
  rev: number;
  updatedAt: string;
}

/** 2단계 동기화용 변경 로그. 1단계에서는 기록만 하고 플러시하지 않는다 */
export interface OutboxStore {
  pending(limit: number): Promise<OutboxEntry[]>;
  /** upToSeq 이하를 서버 반영 완료로 처리 */
  ack(upToSeq: number): Promise<void>;
  count(): Promise<number>;
}

export interface StorageStats {
  folders: number;
  documents: number;
  annotations: number;
  pdfBlobs: number;
  assets: number;
  outboxPending: number;
  /** 저장된 PDF 바이트 합 (중복 제거된 Blob 기준) */
  pdfBytes: number;
}

export interface Storage {
  readonly folders: FolderRepo;
  readonly documents: DocumentRepo;
  readonly annotations: AnnotationRepo;
  readonly blobs: BlobStore;
  readonly assets: AssetStore;
  readonly settings: SettingsStore;
  readonly syncState: SyncStateStore;
  readonly outbox: OutboxStore;
  /** 여러 리포지토리 작업을 하나의 원자적 트랜잭션으로 묶는다 */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  stats(): Promise<StorageStats>;
}
