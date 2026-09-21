# PDF MEMO

로컬 PDF를 불러와 그 위에 메모·필기·꾸미기를 하고 폴더로 정리하는 웹 앱.
로그인 없이 브라우저 안에 저장하고(1단계), 나중에 클라우드 백업·동기화를 붙일 수 있게 설계했다(2단계).

설계 문서: [docs/DESIGN.md](docs/DESIGN.md)

## 구조

```
apps/web        React 19 + Vite PWA. pdf.js 렌더, 필기 엔진, IndexedDB(Dexie) 저장소
apps/api        NestJS 11. 1단계는 health/meta, 2단계에 동기화·Blob presign
packages/shared 도메인 타입 · zod 스키마 · 동기화/백업 계약 (프론트·백엔드 공유)
packages/config 공용 tsconfig
```

## 시작하기

```bash
pnpm install
pnpm build            # shared → web/api 순서로 빌드
pnpm dev              # web http://localhost:5173, api http://localhost:3000/api/v1
```

`pnpm dev`는 turbo가 세 패키지의 dev 스크립트를 함께 띄운다. 웹 개발 서버는 `/api`를 3000 포트로 프록시한다.

## 검증

```bash
pnpm ci               # format:check + lint + build + typecheck + test
```

| 명령             | 내용                                              |
| ---------------- | ------------------------------------------------- |
| `pnpm lint`      | ESLint (flat config, 루트에서 전체)               |
| `pnpm format`    | Prettier 정리                                     |
| `pnpm typecheck` | 패키지별 `tsc --noEmit`                           |
| `pnpm test`      | shared·web: Vitest(fake-indexeddb), api: Jest e2e |

## 배포 (Vercel, 프로젝트 2개)

| 프로젝트       | Root Directory | 비고                                              |
| -------------- | -------------- | ------------------------------------------------- |
| `pdf-memo`     | `apps/web`     | Vite 정적 빌드. `/api/*`를 api 프로젝트로 rewrite |
| `pdf-memo-api` | `apps/api`     | `api/index.js`가 `dist/`의 Nest 앱을 서버리스로   |

각 앱의 `vercel.json`이 설치·빌드 명령을 모노레포 루트 기준으로 지정한다.
`apps/web/vercel.json`의 rewrite 대상 도메인은 api 프로젝트의 실제 프로덕션 도메인으로 맞춘다.

## 단계

- **Phase 0** 모노레포·공용 스키마·저장소 계층·CI·배포 파이프라인 ← 현재
- **Phase 1** PDF 가져오기, 뷰어, 펜·형광펜·텍스트, Undo/Redo, PDF 내보내기, 백업, PWA
- **Phase 1.5** 스티커·도형·텍스트 형광펜·썸네일·검색
- **Phase 2** 계정 연결, 클라우드 백업·동기화
