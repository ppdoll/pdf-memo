# PDF MEMO 설계 문서

작성일: 2026-09-21 · 상태: 초안 v0.1 (구현 전 설계)

로컬 기기의 PDF를 불러와 그 위에 메모·필기·꾸미기를 하고, 폴더로 정리해 브라우저 안에 저장하는 웹 앱.
1단계는 로그인 없는 완전 로컬 저장, 2단계에서 클라우드 백업·기기 간 동기화를 붙일 수 있도록 처음부터 구조를 잡는다.

---

## 0. 한눈에 보기

| 항목         | 결정                                                              |
| ------------ | ----------------------------------------------------------------- |
| 프론트엔드   | React 19 + TypeScript + Vite, PWA (오프라인·홈 화면 설치)         |
| 백엔드       | NestJS 11 (1단계: 스켈레톤 + 공용 스키마 검증, 2단계: 동기화 API) |
| 공용 코드    | `packages/shared` : 도메인 타입 + zod 스키마 (프론트·백엔드 공유) |
| 로컬 저장    | IndexedDB (Dexie) — PDF 원본, 필기 객체, 폴더 트리, 스티커 자산   |
| PDF 렌더     | pdf.js (`pdfjs-dist`)                                             |
| 필기 엔진    | 자체 Canvas 2D 레이어 + `perfect-freehand` (압력 반영 잉크)       |
| 내보내기     | `pdf-lib` — 필기 포함 PDF, 백업 `.zip` (`fflate`)                 |
| 저장 철학    | Local-first. 로컬이 항상 원본, 클라우드는 백업 + 동기화 대상      |
| 저장소·배포  | GitHub `ppdoll/pdf-memo` (제안) → Vercel 프로젝트 2개 (web, api)  |
| 2단계 인프라 | Postgres + 오브젝트 스토리지(presigned 직접 업로드) + JWT 인증    |

---

## 1. 목표와 비목표

### 목표

- PDF를 불러와 펜·형광펜·텍스트 메모·스티커로 꾸미고, 결과를 잃지 않는다.
- 태블릿 + 펜 입력(Apple Pencil, S펜, Windows 펜)에서 자연스럽게 필기된다.
- 로그인 없이 바로 사용. 네트워크가 없어도 동작.
- 파일을 폴더로 정리·검색·이동한다.
- 나중에 클라우드 백업·다중 기기 동기화를 "재작성 없이" 추가할 수 있다.

### 비목표 (지금은 안 함)

- 실시간 협업, 공유 링크, 댓글
- PDF 본문 편집(텍스트 수정, 페이지 삭제·재정렬) — 2단계 이후 검토
- OCR, AI 요약
- 다국어 UI (한국어 우선)

---

## 2. 요청 사항 검토 — 유지 / 수정 제안 / 추가 제안

### 2.1 그대로 진행

- 로컬 저장, 로그인 없음, 폴더 관리, GitHub + Vercel 배포.

### 2.2 수정·보완이 필요한 부분

| #   | 원 요청              | 문제                                                                                                                                                                                      | 제안                                                                                                                                                                      |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "언어는 NestJS"      | NestJS는 서버 프레임워크. PDF 렌더·필기는 전부 브라우저에서 돌아가므로 프론트 프레임워크가 별도로 필요                                                                                    | 프론트는 **React + Vite**. NestJS는 API 서버로 두고 1단계에서는 스켈레톤만 배포. 대신 도메인 타입·검증 스키마를 `packages/shared`로 첫날부터 공유해 2단계에서 그대로 사용 |
| 2   | "모든 저장은 로컬"   | 브라우저 저장소(IndexedDB)는 **브라우저가 지울 수 있음**. Safari는 홈 화면에 추가하지 않은 사이트의 저장소를 7일 미사용 시 삭제할 수 있고, 저장 공간 부족 시 어느 브라우저든 비울 수 있음 | ① 백업/복원(.zip) 필수 ② PWA로 홈 화면 설치 유도 ③ `navigator.storage.persist()` 요청 ④ 데스크톱 Chromium에서는 File System Access API로 "자동 백업 폴더" 옵션            |
| 3   | "로그인 필요 없음"   | 2단계 클라우드에서는 사용자 식별이 필요. 나중에 붙이면 기존 데이터 마이그레이션이 필요해짐                                                                                                | 첫 실행 시 익명 `deviceId` 생성, 모든 엔티티에 `ownerId: string \| null` 필드 확보. 2단계에서 "이 기기를 계정에 연결"은 **병합**이지 마이그레이션이 아님                  |
| 4   | "추후 클라우드 저장" | "저장소를 클라우드로 교체"로 설계하면 오프라인·무로그인 모드가 깨짐                                                                                                                       | **Local-first**: 로컬이 원본, 클라우드는 백업 + 동기화. 변경 로그(outbox) 테이블을 1단계 스키마에 미리 넣어 두되 비활성                                                   |
| 5   | Vercel + NestJS      | Vercel 함수는 요청 본문 4.5 MB 제한, 실행 시간 제한, 콜드 스타트 존재. PDF를 NestJS로 업로드하면 바로 막힘                                                                                | PDF 바이트는 **presigned URL로 스토리지에 직접 업로드**, NestJS는 메타데이터·동기화만 처리. 무거운 PDF 처리는 브라우저에서                                                |
| 6   | "폴더로 관리"        | 폴더만 있으면 한 파일이 한 곳에만 존재. 즐겨찾기·최근·태그 같은 가로 축이 없음                                                                                                            | 중첩 폴더(`parentId`) + 즐겨찾기 + 최근 문서 + 태그(선택) + **휴지통(소프트 삭제)**. 클라우드 없이 실수 복구 수단은 휴지통뿐이므로 필수                                   |

### 2.3 추가로 필요한 기능 (우선순위)

**필수 — MVP에 포함**

- 백업 내보내기/복원 (전체 `.zip`, 폴더 단위)
- PWA: 오프라인 동작, 홈 화면 설치, 앱 아이콘
- 펜 입력 품질: 압력 반영, 손바닥 무시(펜 사용 중 터치 무시), 손가락은 스크롤·확대
- Undo / Redo (문서 세션 단위)
- 자동 저장 + 저장 상태 표시 (스트로크가 끝나면 즉시 저장)
- 필기 포함 PDF 내보내기 (다른 앱·사람과 공유)
- 휴지통 + 30일 후 자동 삭제
- 최근 문서, 마지막으로 본 페이지 기억
- 용량 표시 (`navigator.storage.estimate()`) 와 "저장 공간 부족" 경고
- 동일 PDF 재가져오기 감지 (SHA-256 해시로 중복 방지)

**권장 — 1.5단계**

- 스티커 라이브러리: 내장 팩 + 사용자 이미지 업로드, 최근 사용 스티커
- 도형(사각형·타원·선·화살표), 마스킹 테이프(반복 이미지 띠)
- 텍스트 형광펜 (pdf.js 텍스트 레이어 기반 선택 → 하이라이트)
- 페이지 썸네일 사이드바, PDF 내장 북마크(outline) 이동
- 파일명·태그 검색
- 올가미 선택 → 이동·복사·삭제
- 자동 백업 폴더 (데스크톱 Chromium)
- 다크 모드, 키보드 단축키

**나중 — 2단계 이후**

- 계정 연결, 클라우드 백업, 기기 간 동기화
- 공유 링크(읽기 전용 뷰)
- PDF 본문 텍스트 검색
- 빈 페이지 추가, 페이지 회전·삭제·재정렬
- 픽셀 지우개(스트로크 분할), 도형 인식
- 실시간 협업(Yjs)

---

## 3. 기술 스택과 근거

### 프론트엔드 (`apps/web`)

| 영역       | 선택                           | 이유                                                                                                                                                       |
| ---------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 프레임워크 | React 19 + TypeScript + Vite   | SSR 불필요(개인 도구, SEO 없음). pdf.js·Canvas는 `window` 의존이 커서 Next.js SSR과 충돌 지점이 많음. 정적 빌드로 Vercel에 그대로 배포                     |
| 라우팅     | React Router                   | `/`, `/f/:folderId`, `/d/:documentId`, `/trash`, `/settings`                                                                                               |
| 상태       | Zustand                        | 뷰어 도구 상태·선택 등 UI 상태. 영속 데이터는 전부 IndexedDB                                                                                               |
| 로컬 DB    | Dexie 4                        | IndexedDB 래퍼. 복합 인덱스, 트랜잭션, 버전 마이그레이션, `liveQuery`로 UI 반응형 갱신                                                                     |
| PDF 렌더   | `pdfjs-dist`                   | 표준. 워커 기반 파싱, 텍스트 레이어, outline 제공                                                                                                          |
| 잉크       | `perfect-freehand`             | 압력·속도 기반 스트로크 외곽선. 원본 포인트를 보관하므로 알고리즘 교체 가능                                                                                |
| PDF 쓰기   | `pdf-lib` + `@pdf-lib/fontkit` | 브라우저에서 PDF에 벡터 패스·이미지·텍스트 삽입. **한글 텍스트 내보내기에는 CJK 폰트 임베드 필수**(표준 14폰트는 한글 미지원) → Noto Sans KR 서브셋 임베드 |
| 압축       | `fflate`                       | 백업 zip 생성·해제. 작고 스트리밍 지원                                                                                                                     |
| PWA        | `vite-plugin-pwa` (Workbox)    | 앱 셸 프리캐시, 오프라인                                                                                                                                   |
| ID         | UUID v7                        | 시간순 정렬 가능, 동기화 시 충돌 없음                                                                                                                      |
| 정렬 키    | `fractional-indexing`          | 폴더·문서 수동 정렬이 동기화에서도 충돌 없이 유지                                                                                                          |
| 스타일     | Tailwind CSS (선택)            | 빠른 UI 구성. 대안: CSS Modules                                                                                                                            |
| 검증       | zod (`packages/shared`)        | 백업 파일 import, 동기화 payload 검증을 프론트·백엔드가 같은 스키마로                                                                                      |

### 백엔드 (`apps/api`)

| 영역                      | 선택                                                                                       | 이유                                              |
| ------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 프레임워크                | NestJS 11 + Express 어댑터                                                                 | 요청 사항. Vercel 서버리스 함수로 배포            |
| 검증                      | `nestjs-zod`                                                                               | shared 스키마를 DTO로 재사용                      |
| DB (2단계)                | Postgres (Neon / Vercel Postgres / Supabase) + Drizzle ORM                                 | 서버리스에서 가벼움. Prisma 대비 콜드 스타트 유리 |
| 오브젝트 스토리지 (2단계) | Cloudflare R2 (S3 호환) 또는 Vercel Blob                                                   | presigned URL 직접 업로드. R2는 egress 무료       |
| 인증 (2단계)              | 외부 IdP 발급 JWT를 NestJS에서 검증 (Supabase Auth 또는 Auth.js) + 카카오/구글 소셜 로그인 | NestJS를 얇게 유지. 비밀번호 저장 책임 회피       |

### 저장 방식 비교 (1단계)

| 방식                   | 장점                                        | 단점                                                | 결정                                                    |
| ---------------------- | ------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| IndexedDB              | 모든 브라우저, 대용량 Blob 저장, 오프라인   | 브라우저가 비울 수 있음, 사용자가 파일로 볼 수 없음 | **기본**                                                |
| File System Access API | 실제 폴더에 파일로 저장, 사용자가 직접 접근 | 데스크톱 Chromium 전용, 매 세션 권한 재요청 가능    | 자동 백업 옵션으로만                                    |
| OPFS                   | 빠른 파일 I/O                               | 사용자 비가시, 결국 브라우저 저장소                 | 필요 시 PDF Blob 저장소로 교체 가능하게 인터페이스 분리 |

---

## 4. 시스템 아키텍처

### 4.1 1단계 — 완전 로컬

```
┌──────────────────────────── 브라우저 (PWA) ────────────────────────────┐
│                                                                        │
│  UI (React)                                                            │
│   ├─ Library: 폴더 트리 / 문서 카드 / 가져오기 / 휴지통 / 검색           │
│   ├─ Viewer: 가상화 페이지 리스트, 확대·이동, 썸네일 사이드바            │
│   ├─ Annotate: 도구바, 레이어 캔버스, 선택·변형, Undo/Redo               │
│   └─ Export: 필기 포함 PDF, 백업 zip                                    │
│                         │                                              │
│  Domain Services        │  (StorageAdapter 인터페이스만 의존)            │
│   ├─ LibraryService  ├─ AnnotationService ├─ ExportService ├─ BackupSvc │
│                         │                                              │
│  Storage (IndexedDB / Dexie)                                           │
│   folders · documents · pdfBlobs · annotations · assets · settings     │
│   outbox(비활성) · syncState                                           │
│                                                                        │
│  Workers: pdf.js 워커 · SHA-256 해시 워커 · 썸네일 워커                 │
└────────────────────────────────────────────────────────────────────────┘
                 │ (1단계에서는 /api/health 정도만 호출, 실패해도 무관)
┌────────────────▼──── Vercel (apps/api, NestJS 스켈레톤) ────────────────┐
│  GET /api/v1/health · GET /api/v1/meta (앱 버전, 최소 클라이언트 버전)   │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2 2단계 — 클라우드 백업·동기화 (Local-first)

```
브라우저(기기 A) ──┐                         ┌── 브라우저(기기 B)
 IndexedDB(원본)   │  push/pull (변경 로그)   │   IndexedDB(원본)
 SyncEngine ───────┼──────────────► NestJS API ◄─┼─────── SyncEngine
                   │                  │          │
     PDF 바이트 ───┼─ presigned PUT ──┼─► Object Storage (R2 / Vercel Blob)
                   │                  ▼
                   │              Postgres (users, changes 로그, 엔티티 스냅샷)
                   │                  ▲
                   └── JWT (Supabase Auth / Auth.js 발급) ─┘
```

핵심 원칙

- 로컬 DB가 항상 진실의 원천. 서버는 변경 로그를 받아 보관하고 다른 기기에 전달한다.
- 네트워크 없이도 모든 기능 동작. 로그인은 "선택"이고, 하지 않으면 1단계와 동일.
- PDF 바이트는 내용 해시(SHA-256)로 주소화. 같은 파일은 한 번만 업로드.

---

## 5. 모노레포 구조

```
pdf-memo/
├─ apps/
│  ├─ web/                          # React + Vite (PWA)
│  │  ├─ public/                    # 아이콘, manifest 원본, 내장 스티커 팩
│  │  ├─ src/
│  │  │  ├─ app/                    # 라우터, Providers, 전역 레이아웃
│  │  │  ├─ features/
│  │  │  │  ├─ library/             # 폴더 트리, 문서 목록, 가져오기, 휴지통, 검색
│  │  │  │  ├─ viewer/              # PDF 페이지 렌더, 가상 스크롤, 확대·이동
│  │  │  │  ├─ annotate/            # 도구, 레이어 캔버스, 입력 처리, 선택/변형, undo
│  │  │  │  ├─ stickers/            # 스티커 팩, 사용자 이미지
│  │  │  │  ├─ export/              # 필기 포함 PDF, 백업 zip, 복원
│  │  │  │  └─ settings/            # 펜 기본값, 저장 공간, 백업, (2단계) 계정
│  │  │  ├─ storage/
│  │  │  │  ├─ ports.ts             # StorageAdapter 인터페이스(Repo 계약)
│  │  │  │  ├─ dexie/               # IndexedDB 구현 + 마이그레이션
│  │  │  │  └─ sync/                # (2단계) SyncEngine, outbox 플러시
│  │  │  ├─ workers/                # hash.worker.ts, thumbnail.worker.ts
│  │  │  └─ ui/                     # 공용 컴포넌트
│  │  ├─ vite.config.ts
│  │  └─ vercel.json                # /api/* → api 프로젝트로 rewrite
│  └─ api/                          # NestJS
│     ├─ src/
│     │  ├─ main.ts                 # 로컬 실행용 (listen)
│     │  ├─ app.module.ts
│     │  ├─ bootstrap.ts            # Nest 앱 생성 공용 함수 (main.ts와 Vercel 핸들러가 공유)
│     │  ├─ health/
│     │  ├─ meta/
│     │  ├─ auth/                   # 2단계: JWT 가드
│     │  ├─ sync/                   # 2단계: push / pull
│     │  ├─ blobs/                  # 2단계: presign / complete / download-url
│     │  └─ common/                 # 필터, 인터셉터, zod 파이프
│     ├─ api/index.ts               # Vercel 서버리스 엔트리 (dist를 import)
│     ├─ drizzle/                   # 2단계: 스키마·마이그레이션
│     └─ vercel.json
├─ packages/
│  ├─ shared/                       # 도메인 타입, zod 스키마, 상수, 좌표 변환 유틸
│  │  └─ src/
│  │     ├─ domain/                 # folder.ts, document.ts, annotation.ts, asset.ts
│  │     ├─ sync/                   # Change, PushRequest, PullResponse 스키마
│  │     ├─ backup/                 # manifest 스키마, 버전
│  │     └─ index.ts
│  └─ config/                       # tsconfig base, eslint 설정
├─ .github/workflows/ci.yml         # lint · typecheck · test · build
├─ pnpm-workspace.yaml
├─ turbo.json
├─ package.json
└─ README.md
```

- 패키지 매니저 pnpm, 태스크 러너 Turborepo.
- `packages/shared`는 브라우저·Node 양쪽에서 import되므로 DOM·Node 전용 API를 넣지 않는다.

---

## 6. 도메인 모델

모든 영속 엔티티는 아래 공통 필드를 가진다. 동기화·휴지통·충돌 해결이 이 필드에 의존한다.

```ts
// packages/shared/src/domain/base.ts
export interface BaseEntity {
  id: string; // UUID v7
  createdAt: string; // ISO 8601
  updatedAt: string;
  deletedAt: string | null; // 소프트 삭제 (휴지통 + 동기화 tombstone)
  rev: number; // 로컬 변경마다 +1. 충돌 감지용
  ownerId: string | null; // 1단계 null, 2단계 계정 연결 시 채움
}
```

### 6.1 Folder

```ts
export interface Folder extends BaseEntity {
  parentId: string; // ROOT_FOLDER_ID('root') = 루트. IndexedDB는 null을 인덱싱하지 못하므로 sentinel 사용
  name: string;
  color: string | null; // 폴더 색 라벨
  sortKey: string; // fractional index
}
```

- 순환 참조 금지(이동 시 자손 폴더로 이동 불가 검증).
- UI에서는 깊이 5단계까지만 허용(성능·가독성).

### 6.2 PdfDocument (PDF 한 개)

```ts
export interface PdfDocument extends BaseEntity {
  // DOM Document와 이름 충돌을 피한다
  folderId: string; // ROOT_FOLDER_ID 또는 폴더 id
  title: string;
  originalFileName: string;
  blobHash: string; // → PdfBlob.hash (SHA-256 hex)
  byteSize: number;
  pageCount: number;
  pageSizes: Array<{ w: number; h: number; rotation: 0 | 90 | 180 | 270 }>; // PDF pt 단위
  thumbnailAssetId: string | null;
  favorite: boolean;
  tags: string[];
  sortKey: string;
  lastOpenedAt: string | null;
  lastViewedPage: number; // 0-based
}
```

### 6.3 PdfBlob (내용 주소화 저장)

```ts
export interface PdfBlob {
  hash: string; // PK. SHA-256
  byteSize: number;
  data: Blob; // 로컬 전용. 서버에서는 오브젝트 스토리지 키 = hash
  refCount: number; // 참조하는 PdfDocument 수 (휴지통 포함). 0이 되면 GC
  uploadedAt: string | null; // 2단계: 클라우드 업로드 완료 시각
}
```

### 6.4 Asset (스티커·이미지·썸네일)

```ts
export interface Asset {
  id: string; // 사용자 업로드는 SHA-256, 내장 팩은 'pack:<pack>/<name>'
  kind: 'sticker' | 'image' | 'thumbnail';
  mime: string;
  width: number;
  height: number;
  data: Blob;
  createdAt: string;
  ownerId: string | null;
}
```

### 6.5 Annotation 객체 (핵심)

**저장 단위는 "객체 1개 = 행 1개"**. 페이지 단위 JSON 덩어리가 아니다.

- 스트로크 하나가 끝날 때 그 행만 쓰므로 저장이 빠르다.
- Undo/Redo, 선택·이동·삭제가 객체 단위로 자연스럽다.
- 2단계 동기화에서 객체별 Last-Writer-Wins가 가능해 두 기기가 같은 페이지를 편집해도 서로 덮어쓰지 않는다.

**좌표계**: "페이지 공간" = PDF 포인트 단위, 원점 좌상단, 회전 0, 배율 1.
pdf.js `getViewport({ scale: 1, rotation: 0 })` 과 동일. 화면 배율·DPR과 무관하게 저장되고, 내보내기 시 PDF 사용자 공간(원점 좌하단)으로 `y' = pageHeight - y` 변환.

```ts
// packages/shared/src/domain/annotation.ts
export const ANNOTATION_SCHEMA_VERSION = 1;

interface AnnotationBase extends BaseEntity {
  schemaVersion: number;
  documentId: string;
  pageIndex: number; // 0-based
  z: number; // 그리기 순서 (페이지 내)
  bbox: [x: number, y: number, w: number, h: number]; // 히트 테스트·부분 렌더용
  locked: boolean;
}

export interface InkObject extends AnnotationBase {
  type: 'ink';
  tool: 'pen' | 'highlighter' | 'marker';
  color: string; // '#RRGGBB'
  opacity: number; // 0..1 (형광펜 0.4, multiply 블렌드)
  width: number; // 기준 굵기 (pt)
  points: number[]; // [x, y, pressure, x, y, pressure, ...] 소수 2자리 반올림
  smoothing: { thinning: number; streamline: number; smoothing: number }; // perfect-freehand 옵션 스냅샷
}

export interface TextObject extends AnnotationBase {
  type: 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number; // deg
  content: string; // plain text (줄바꿈 포함)
  fontFamily: string; // 'system' | 'NotoSansKR' | 손글씨 폰트 id
  fontSize: number; // pt
  color: string;
  align: 'left' | 'center' | 'right';
  background: string | null; // 메모지 배경색 (null = 투명)
}

export interface HighlightObject extends AnnotationBase {
  type: 'highlight'; // 텍스트 레이어 기반 형광펜
  rects: Array<[x: number, y: number, w: number, h: number]>;
  color: string;
  opacity: number;
}

export interface ImageObject extends AnnotationBase {
  type: 'image'; // 스티커, 사진, 마스킹 테이프
  assetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  repeat: 'none' | 'x'; // 'x' = 테이프처럼 가로 반복
  flipX: boolean;
  flipY: boolean;
}

export interface ShapeObject extends AnnotationBase {
  type: 'shape';
  shape: 'rect' | 'ellipse' | 'line' | 'arrow';
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  stroke: string;
  strokeWidth: number;
  fill: string | null;
  dash: number[] | null;
}

export interface NoteObject extends AnnotationBase {
  type: 'note'; // 접히는 스티키 노트 (아이콘 + 팝업 본문)
  x: number;
  y: number;
  content: string;
  color: string;
  collapsed: boolean;
}

export type AnnotationObject =
  InkObject | TextObject | HighlightObject | ImageObject | ShapeObject | NoteObject;
```

### 6.6 Settings / SyncState / Outbox

```ts
export interface Settings {
  // key-value, 기기 로컬
  key: string;
  value: unknown;
}
// 예: 'pen.default', 'touch.drawWithFinger', 'ui.theme', 'backup.lastReminderAt'

export interface SyncState {
  // 2단계, 기기 로컬
  key: 'deviceId' | 'cursor' | 'lastSyncAt' | 'accountId';
  value: string;
}

export interface OutboxEntry {
  // 2단계 (1단계 스키마에 미리 생성, 기록만 함)
  seq: number; // auto-increment
  entity: 'folder' | 'document' | 'annotation' | 'asset';
  entityId: string;
  op: 'upsert' | 'delete';
  rev: number;
  updatedAt: string;
}
```

---

## 7. 로컬 저장소 설계

### 7.1 Dexie 스키마 (v1)

```ts
db.version(1).stores({
  folders: 'id, parentId, updatedAt, deletedAt',
  documents: 'id, folderId, blobHash, updatedAt, deletedAt, lastOpenedAt, *tags',
  pdfBlobs: 'hash',
  annotations: 'id, [documentId+pageIndex], documentId, updatedAt, deletedAt',
  assets: 'id, kind',
  settings: 'key',
  syncState: 'key',
  outbox: '++seq, entity, entityId',
});
```

- IndexedDB는 null·boolean을 키로 쓸 수 없다. 루트는 `ROOT_FOLDER_ID`('root') sentinel로 표현하고, `favorite` 같은 boolean은 인덱스에 넣지 않는다.
- 페이지 열기: `annotations.where('[documentId+pageIndex]').equals([docId, i])` 한 번.
- 문서 삭제(휴지통 비우기): 트랜잭션으로 annotations 일괄 삭제 → `pdfBlobs.refCount--` → 0이면 Blob 삭제.
- 스키마 변경은 Dexie `version(n).upgrade()`로만. 객체에도 `schemaVersion`을 넣어 백업 파일 호환성 유지.

### 7.2 StorageAdapter 계약 (프론트 내부 포트)

```ts
export interface Repo<T extends BaseEntity> {
  get(id: string): Promise<T | undefined>;
  put(entity: T): Promise<void>; // rev++, updatedAt 갱신, outbox 기록
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  purge(id: string): Promise<void>; // 물리 삭제
}
export interface Storage {
  folders: Repo<Folder> & { children(parentId: string): Promise<Folder[]> };
  documents: Repo<PdfDocument> & {
    inFolder(folderId: string): Promise<PdfDocument[]>;
    recent(n: number): Promise<PdfDocument[]>;
  };
  annotations: Repo<AnnotationObject> & {
    page(docId: string, pageIndex: number): Promise<AnnotationObject[]>;
    bulkPut(objs: AnnotationObject[]): Promise<void>;
  };
  blobs: {
    get(hash: string): Promise<Blob | undefined>;
    put(hash: string, blob: Blob): Promise<void>;
    release(hash: string): Promise<void>;
  };
  assets: {
    get(id: string): Promise<Asset | undefined>;
    put(a: Asset): Promise<void>;
    list(kind: Asset['kind']): Promise<Asset[]>;
  };
  settings: {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, v: unknown): Promise<void>;
  };
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
```

- UI와 서비스는 이 인터페이스만 본다. 테스트는 `fake-indexeddb`로 실제 Dexie 구현을 그대로 돌린다.
- 2단계에서도 이 구현은 유지되고, 옆에 `SyncEngine`이 붙는다(교체가 아님).

### 7.3 저장소 유실 대응

| 위험                      | 대응                                                                             |
| ------------------------- | -------------------------------------------------------------------------------- |
| Safari 7일 미사용 삭제    | 홈 화면 설치(PWA) 안내 배너. 설치 시 예외 적용                                   |
| 용량 압박으로 eviction    | `persist()` 요청(Chromium·Firefox), 용량 게이지, 큰 PDF 가져올 때 예상 용량 안내 |
| 사용자 실수 삭제          | 휴지통 30일 보관                                                                 |
| 기기 고장·브라우저 초기화 | 주간 백업 알림, 백업 zip 내보내기, (Chromium) 자동 백업 폴더                     |

### 7.4 백업 포맷 (`.pdfmemo.zip`)

```
manifest.json      { formatVersion: 1, appVersion, exportedAt, deviceId, counts }
folders.json       Folder[]
documents.json     PdfDocument[]
annotations/<documentId>.json    AnnotationObject[]
assets/<assetId>   바이너리
pdfs/<hash>.pdf    원본 PDF
```

- 복원은 **병합**: 같은 id는 `updatedAt`이 최신인 쪽을 채택, 없는 id는 추가. 덮어쓰기 모드는 별도 확인 후.
- 이 포맷은 2단계의 "최초 클라우드 업로드"와 "계정 병합"에도 그대로 쓰인다.
- 대용량 대응: `fflate`의 스트리밍 zip으로 PDF Blob을 하나씩 흘려 넣어 메모리 상한을 넘기지 않는다.

---

## 8. 뷰어와 필기 엔진

### 8.1 페이지 렌더 파이프라인

1. `pdfjs-dist`의 `getDocument({ data })`로 로드(파싱은 pdf.js 워커).
2. 세로 가상 스크롤 리스트: 현재 보이는 페이지 ±2장만 마운트.
3. 배율은 버킷(1, 1.5, 2, 3)으로 렌더하고 사이 값은 CSS transform으로 확대, 제스처 종료 후 재렌더.
4. 렌더 결과는 `ImageBitmap`으로 캐시 (키: pageIndex + 배율 버킷). LRU 20장.
5. DPR 반영: 캔버스 크기 = CSS 크기 × `devicePixelRatio`.

### 8.2 페이지 레이어 구성 (페이지마다)

```
┌ page container (position: relative) ─────────────────────┐
│ 1. <canvas> PDF 렌더 (정적)                              │
│ 2. <canvas> 확정 주석 렌더 (객체 목록 → 그리기, 변경 시만)│
│ 3. <canvas> 라이브 레이어 (그리는 중인 스트로크·선택 핸들)│
│ 4. <div>    pdf.js 텍스트 레이어 (텍스트 선택·형광펜)     │
│ 5. <div>    HTML 오버레이 (텍스트 편집 textarea, 노트 팝업)│
└──────────────────────────────────────────────────────────┘
```

- 그리는 중에는 3번 레이어에만 그려 매 `pointermove`마다 전체 객체를 다시 그리지 않는다.
- 스트로크 종료 시: 객체 생성 → 저장 → 2번 레이어에 해당 객체만 추가 그리기.
- 형광펜은 `globalCompositeOperation = 'multiply'`.

### 8.3 입력 처리

| 입력                            | 동작                                                  |
| ------------------------------- | ----------------------------------------------------- |
| `pointerType === 'pen'`         | 현재 도구로 그리기. 압력 `e.pressure`, 필요 시 tilt   |
| `pointerType === 'touch'` (1개) | 기본: 스크롤. 설정에서 "손가락으로 그리기" 켤 수 있음 |
| `touch` 2개                     | 핀치 확대, 두 손가락 이동                             |
| `mouse`                         | 그리기. 휠 = 스크롤, Ctrl+휠 = 확대                   |
| 펜이 활성 중인 touch            | 무시 (손바닥 리젝션)                                  |
| 펜 버튼 / 뒤집기(eraser)        | `e.button === 5` 또는 `buttons & 32` 이면 지우개      |

- 그리기 표면에만 `touch-action: none`. 도구가 "손" 모드일 때는 브라우저 기본 스크롤 유지.
- `getCoalescedEvents()` 지원 시 샘플 전부 사용, 미지원 시 일반 `pointermove` 폴백.
- 스트로크 진행 중 `pointercancel`·`pointerleave` 시에도 저장(조각 유실 방지).

### 8.4 도구 목록 (MVP)

펜 · 형광펜 · 마커 · 지우개(스트로크 단위) · 올가미 선택 · 텍스트 · 스티커 · 손(이동) · Undo · Redo
색상 프리셋 8개 + 커스텀, 굵기 프리셋 4개. 펜 설정은 도구별로 기억.

### 8.5 Undo / Redo

- 커맨드 패턴: `{ kind: 'add' | 'update' | 'remove'; before?: AnnotationObject; after?: AnnotationObject }[]` (한 동작 = 커맨드 묶음).
- 스택은 문서 세션 메모리에 200개 제한. 저장소 반영은 커맨드 실행·되돌리기마다 즉시.
- 페이지 이동해도 스택 유지, 문서 닫으면 폐기.

### 8.6 저장 정책

- 스트로크·객체 변경 완료 즉시 `put` (IndexedDB 쓰기는 수 ms).
- 드래그·크기 조절 중에는 라이브 레이어에서만 변형하고 손을 떼면 1회 저장.
- 상단에 "저장됨 / 저장 중 / 오류" 표시. 오류 시 재시도 큐 + 사용자 알림.

### 8.7 성능 목표

| 항목               | 목표                                                  |
| ------------------ | ----------------------------------------------------- |
| 스트로크 지연      | 펜 이동 → 화면 반영 16 ms 이내                        |
| 100페이지 PDF 열기 | 첫 페이지 표시 1.5 s 이내 (해시 계산은 워커에서 병렬) |
| 페이지당 객체      | 1,000개까지 스크롤 60 fps                             |
| 가져오기 상한      | 개별 PDF 200 MB (경고), 그 이상은 거부                |

---

## 9. 내보내기

### 9.1 필기 포함 PDF (`pdf-lib`)

| 객체              | 내보내기 방식                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| ink               | `perfect-freehand` 외곽선 폴리곤 → `page.drawSvgPath()` 벡터. 형광펜은 `blendMode: Multiply`          |
| shape             | 벡터 (`drawRectangle`, `drawEllipse`, `drawLine`)                                                     |
| text / note       | `@pdf-lib/fontkit` + Noto Sans KR 서브셋 임베드(`subset: true`). 폰트 파일은 첫 내보내기 때 lazy 로드 |
| image / highlight | `embedPng/embedJpg` 후 `drawImage`, 형광펜 사각형은 벡터                                              |

- 좌표 변환: 페이지 공간 → PDF 사용자 공간 (y 반전, 페이지 회전 보정).
- 옵션: "주석만 래스터로" (모든 레이어를 PNG로 굽는 폴백. 호환성 최우선일 때).
- 결과는 `Blob` → 다운로드 또는 Web Share API로 공유.

### 9.2 기타

- 주석 JSON만 내보내기 (다른 사람이 같은 PDF를 가지고 있을 때).
- 페이지를 PNG로 내보내기 (SNS 공유용).

---

## 10. NestJS API 설계

### 10.1 1단계 (스켈레톤)

```
GET /api/v1/health   → { status: 'ok', time }
GET /api/v1/meta     → { apiVersion, minWebVersion, features: { sync: false } }
```

- 프론트는 `/meta`로 기능 플래그를 읽되, 실패해도 로컬 모드로 정상 동작.

### 10.2 2단계 엔드포인트

```
POST /api/v1/auth/session          IdP 토큰 교환 → httpOnly 쿠키 (또는 Bearer)
GET  /api/v1/me                    { userId, devices[] }
POST /api/v1/devices/link          { deviceId } → 익명 기기를 계정에 연결

POST /api/v1/sync/push             { deviceId, changes: Change[] }
                                   → { accepted: id[], conflicts: Change[], cursor }
GET  /api/v1/sync/pull?cursor=&limit=  → { changes: Change[], cursor, hasMore }

POST /api/v1/blobs/presign         { hash, byteSize, mime } → { exists, uploadUrl?, headers? }
POST /api/v1/blobs/:hash/complete  업로드 완료 확인(크기·해시 검증) → 204
GET  /api/v1/blobs/:hash/url       → { downloadUrl, expiresAt }
```

```ts
// packages/shared/src/sync/change.ts
export interface Change {
  entity: 'folder' | 'document' | 'annotation' | 'asset';
  id: string;
  op: 'upsert' | 'delete';
  rev: number;
  updatedAt: string;
  deviceId: string;
  payload: Folder | PdfDocument | AnnotationObject | AssetMeta | null; // delete면 null
}
```

### 10.3 서버 데이터 모델 (Postgres, Drizzle)

```
users(id, provider, provider_id, created_at)
devices(id, user_id, name, last_seen_at)
changes(seq bigserial PK, user_id, entity, entity_id, op, rev, updated_at, device_id, payload jsonb)
   index (user_id, seq)                   -- pull 커서
entity_heads(user_id, entity, entity_id, rev, updated_at, device_id, deleted, payload jsonb)
   PK (user_id, entity, entity_id)        -- 최신 상태 스냅샷(신규 기기 초기 동기화용)
blobs(hash PK, user_id, byte_size, mime, storage_key, uploaded_at)
```

### 10.4 모듈 구조

```
AppModule
├─ ConfigModule (zod로 env 검증)
├─ HealthModule, MetaModule
├─ AuthModule      (JwtGuard: IdP 공개키(JWKS)로 검증, req.user 주입)
├─ SyncModule      (SyncController, SyncService, ChangesRepository)
├─ BlobsModule     (S3 presign / Vercel Blob client token)
└─ CommonModule    (ZodValidationPipe, HttpExceptionFilter, RequestIdInterceptor)
```

### 10.5 Vercel 서버리스 엔트리

```ts
// apps/api/src/bootstrap.ts
export async function createApp() {
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  await app.init();
  return server;
}

// apps/api/api/index.ts  (Vercel이 함수로 인식)
import { createApp } from '../dist/bootstrap'; // ← nest build(tsc) 결과물을 import
let cached: ReturnType<typeof createApp> | undefined;
export default async function handler(req, res) {
  cached ??= createApp();
  (await cached)(req, res);
}
```

- **주의**: Vercel의 TS 함수 번들러는 `emitDecoratorMetadata`를 처리하지 못할 수 있다. NestJS 소스를 함수 파일에서 직접 import하지 말고, `nest build`로 만든 `dist/`를 import한다. 빌드 커맨드: `pnpm --filter api build`.
- `apps/api/vercel.json`:
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/api/index" }] }
  ```
- 인스턴스 재사용을 위해 Nest 앱은 모듈 스코프에 캐시. DB 커넥션은 서버리스용 드라이버(Neon serverless / pg with pool size 1).

---

## 11. 동기화 설계 (2단계 상세)

### 11.1 흐름

1. 모든 로컬 쓰기는 `Repo.put/softDelete` 안에서 같은 트랜잭션으로 `outbox`에 기록 (1단계부터 기록, 플러시만 비활성).
2. `SyncEngine`은 온라인·포그라운드·변경 발생 5초 후 debounce로 `outbox`를 100개씩 묶어 `push`.
3. 서버는 각 change를 `entity_heads`와 비교:
   - 서버 head 없음 또는 `updatedAt`가 더 오래됨 → 수락, `changes`에 append, head 갱신.
   - 서버 head가 더 최신 → **conflict**로 반환(서버 head 포함). 클라이언트는 서버 값을 로컬에 반영(LWW). 동률이면 `deviceId` 사전순.
4. `pull`은 마지막 `cursor` 이후 `changes`를 받아 로컬 적용. 로컬에 더 최신 rev가 있으면 무시.
5. PDF Blob: `PdfDocument` 업서트 전에 `blobs/presign` → `exists: false`면 스토리지에 직접 PUT → `complete`. 다운로드는 필요 시(문서 열 때) lazy.

### 11.2 왜 CRDT가 아니라 객체별 LWW인가

- 사용자 1명, 기기 2~3대. 같은 스트로크를 두 기기에서 동시에 수정하는 경우가 거의 없다.
- 주석이 **객체 단위 행**이므로 서로 다른 스트로크는 충돌 자체가 없다. 진짜 충돌은 "같은 텍스트 박스를 양쪽에서 수정"뿐이고 LWW로 충분.
- 나중에 협업이 필요하면 페이지 단위 Yjs 문서로 옮길 수 있게, 객체는 이미 id 키의 평면 맵이다.

### 11.3 계정 연결 (익명 → 로그인)

1. 로그인 성공 → `POST /devices/link { deviceId }`.
2. 서버에 이미 데이터가 있으면(다른 기기에서 먼저 로그인) 로컬 전체를 push, 서버 전체를 pull → 병합 규칙은 백업 복원과 동일.
3. 로컬 엔티티의 `ownerId`를 일괄 채운다. 이후 로컬 모드와 동일하게 동작하며 백그라운드 동기화만 추가.

---

## 12. 배포

### 12.1 GitHub

- 저장소 `ppdoll/pdf-memo` (이름은 변경 가능). 기본 브랜치 `main`, 기능 브랜치 → PR → squash merge.
- GitHub Actions `ci.yml`: pnpm 캐시 → `turbo lint typecheck test build`. PR마다 실행.
- Dependabot: npm 주간.

### 12.2 Vercel (단일 프로젝트, 저장소 루트)

Hobby 개인 계정에서 대시보드 설정 없이 push만으로 동작하도록 **프로젝트 1개**로 배포한다. Root Directory는 저장소 루트(기본값) 그대로 두고, 루트 `vercel.json`이 빌드·출력·라우팅을 모두 지정한다.

| 항목             | 값                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install          | `pnpm install --frozen-lockfile`                                                                                                                   |
| Build            | `pnpm turbo run build --filter=@pdf-memo/web --filter=@pdf-memo/api` (shared → web·api)                                                            |
| Output Directory | `apps/web/dist` (Vite 정적 파일)                                                                                                                   |
| Functions        | 루트 `api/index.js` 1개. `nest build` 결과물 `apps/api/dist/bootstrap`을 require해 Express 핸들러로 서빙                                           |
| Rewrites         | `/api/(.*)` → `/api/index` (Nest는 원래 경로 `/api/v1/...`를 그대로 받음), 그 외 → `/index.html` (SPA 폴백). 정적 파일은 rewrite보다 먼저 매칭된다 |

- web과 api가 같은 오리진·같은 커밋으로 배포되므로 CORS·쿠키 문제가 없고, PR Preview에서도 web+api를 함께 검증할 수 있다.
- api 도메인을 하드코딩할 필요가 없다. 나중에 트래픽·배포 주기가 달라지면 apps/api를 별도 프로젝트(Root Directory `apps/api`)로 떼어내고 web 쪽 rewrite를 외부 URL로 바꾸면 된다.
- Vercel Git 연동으로 PR마다 Preview 배포, `main` 머지 시 Production. Node 버전은 프로젝트 설정(22.x).
- 1단계에서는 health/meta만 배포. 프론트는 API 실패를 정상 경로(로컬 모드)로 처리한다.
- 환경 변수(2단계): `DATABASE_URL`, `BLOB_*` 또는 `S3_*`, `AUTH_JWKS_URL`. 같은 오리진이므로 `WEB_ORIGIN`(CORS)은 프록시 없이 로컬 개발할 때만 필요하다.
- pdf.js 워커 파일과 CJK 폰트는 정적 자산으로 포함(`Cache-Control: immutable`).
- 주의: Vercel 함수는 요청 본문 4.5 MB 제한이 있으므로 2단계 PDF 업로드는 presigned URL로 스토리지에 직접 올린다(§10.2).
- 프로덕션 URL: https://pdf-memo-web.vercel.app — Vercel 계정은 GitHub `ppdoll`로 로그인하는 `ppdoll-7834's projects` 팀(2026-09-22 첫 배포 성공). 배포 고유 URL(해시 포함)은 Deployment Protection 기본값으로 Vercel 로그인이 필요하고, 프로덕션 도메인만 공개다.

---

## 13. 테스트 전략

| 층            | 도구                        | 대상                                                                                                                       |
| ------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 단위 (shared) | Vitest                      | zod 스키마, 좌표 변환, 백업 병합 규칙, LWW 판정                                                                            |
| 단위 (web)    | Vitest + `fake-indexeddb`   | Dexie Repo, refCount GC, Undo/Redo, outbox 기록                                                                            |
| 컴포넌트      | Vitest + Testing Library    | 도구바, 폴더 트리 조작                                                                                                     |
| E2E           | Playwright                  | PDF 가져오기 → 그리기 → 새로고침 후 유지 → 내보내기 → 백업/복원. 펜 압력은 `page.mouse`로 제한적, 태블릿은 수동 체크리스트 |
| API           | Jest(Nest 기본) + supertest | health/meta, 2단계 sync push/pull 규칙                                                                                     |
| 계약          | shared 스키마 스냅샷        | 프론트 payload ↔ NestJS DTO 불일치 방지                                                                                    |

---

## 14. 로드맵

**Phase 0 — 기반 (1주)**

- [x] 모노레포 스캐폴딩(pnpm, turbo, shared, web, api), ESLint/Prettier, CI
- [x] GitHub 저장소, Vercel 프로젝트(단일, 루트), 배포 확인
- [x] shared: 도메인 타입·zod 스키마 v1, Dexie 스키마 v1, StorageAdapter + 테스트

**Phase 1 — MVP (3~4주)**

- [x] 라이브러리(2026-09-22, 즐겨찾기는 후속): 폴더 트리 CRUD, PDF 가져오기(드래그앤드롭·다중), 해시 중복 감지, 문서 카드·썸네일, 최근, 즐겨찾기, 휴지통
- [x] 뷰어(2026-09-22): 가상 스크롤, 확대·이동, 마지막 페이지 기억
- [x] 필기(2026-09-22, 텍스트 도구는 후속): 펜·형광펜·마커·지우개·손, 압력, 손바닥 무시, 손가락 이동·핀치 확대, Undo/Redo, 자동 저장 표시
- [x] 내보내기(2026-09-22): 필기 포함 PDF를 pdf-lib로 벡터 플래튼, 원본 PDF 저장, 모바일 공유 시트. 한글 텍스트 폰트 임베드는 텍스트 도구와 함께
- [x] 백업 zip 내보내기 + 복원(2026-09-22): fflate 스트리밍 zip, 병합 복원(같은 id는 updatedAt 최신 우선, 부모 폴더 먼저·고아는 루트로), 설정 화면 백업 패널, 라이브러리 백업 알림
- [ ] PWA: 매니페스트, 오프라인, 설치 배너, `persist()` 요청, 용량 게이지
- [x] api: health/meta 배포

**Phase 1.5 — 꾸미기·편의 (2~3주)**

- [ ] 스티커 팩 + 사용자 이미지, 도형, 마스킹 테이프
- [ ] 텍스트 형광펜(텍스트 레이어), 올가미 선택·변형
- [ ] 페이지 썸네일 사이드바, PDF outline
- [ ] 검색, 태그, 다크 모드, 단축키, 자동 백업 폴더(Chromium)

**Phase 2 — 클라우드 (3~4주)**

- [ ] 인증(IdP 선택), JWT 가드, 기기 연결
- [ ] Postgres 스키마, sync push/pull, presigned blob 업로드
- [ ] SyncEngine, 충돌 UI(“다른 기기의 변경으로 대체됨” 알림), 동기화 상태 표시
- [ ] 계정 병합 플로우, 계정 삭제(데이터 전부 삭제)

---

## 15. 리스크와 완화

| 리스크                            | 영향              | 완화                                                                                        |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| iPad Safari 저장소 삭제           | 데이터 유실       | PWA 설치 유도, 백업 알림, 2단계 클라우드                                                    |
| pdf-lib 한글 폰트 크기(수 MB)     | 내보내기 느림     | 서브셋 임베드, 폰트 lazy 로드 + 캐시                                                        |
| 대용량 PDF(스캔본 100 MB+) 메모리 | 탭 크래시         | 가져오기 상한, 페이지 캐시 LRU, 배율 상한                                                   |
| NestJS 콜드 스타트                | 첫 API 호출 1~3초 | 1단계에선 무관. 2단계는 백그라운드 동기화라 체감 적음. 필요 시 Fluid compute                |
| Vercel 본문 4.5 MB                | PDF 업로드 불가   | presigned 직접 업로드 (설계에 반영)                                                         |
| 펜 이벤트 브라우저 편차           | 필기 품질         | Pointer Events만 사용, 실기기 테스트 매트릭스(iPad Safari, Galaxy Tab Chrome, Windows Edge) |
| 데코레이터 메타데이터 번들 이슈   | Nest DI 실패      | dist import 패턴(§10.5)                                                                     |

---

## 16. 확인이 필요한 사항 (기본값으로 진행 중)

| 질문                                                                     | 현재 기본값                                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 주 사용 기기는? (iPad / 갤럭시 탭 / Windows 펜 노트북 / 데스크톱 마우스) | 태블릿 + 펜 우선, 데스크톱 겸용                                         |
| 프론트 React + Vite로 진행해도 되는지                                    | 예                                                                      |
| 저장소 이름                                                              | `ppdoll/pdf-memo`                                                       |
| 스타일링                                                                 | Tailwind CSS                                                            |
| 2단계 클라우드 조합                                                      | Supabase(Auth + Postgres) + Cloudflare R2, NestJS는 JWT 검증·동기화 API |
| 소셜 로그인 제공자(2단계)                                                | 카카오 + 구글                                                           |
| 내장 스티커 팩 출처                                                      | 직접 제작 또는 CC0 이미지. 상업 폰트·스티커는 라이선스 확인 필요        |
| 빈 페이지 추가(노트 기능) 필요 여부                                      | 2단계 이후                                                              |
