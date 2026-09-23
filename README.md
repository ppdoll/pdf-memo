# ALL READ MEMO

> 제품 이름은 2026-09-23에 PDF MEMO에서 ALL READ MEMO로 바꿨습니다. 저장소·패키지 이름(`pdf-memo`, `@pdf-memo/*`), IndexedDB 이름, 백업 확장자(`.pdfmemo.zip`)는 기존 데이터 호환을 위해 그대로 둡니다. 표시 이름은 `apps/web/src/app/brand.ts` 한 곳에서 바꿉니다.

로컬 PDF를 불러와 그 위에 메모·필기·꾸미기를 하고 폴더로 정리하는 웹 앱.
로그인 없이 브라우저 안에 저장하고(1단계), 나중에 클라우드 백업·동기화를 붙일 수 있게 설계했다(2단계).

설계 문서: [docs/DESIGN.md](docs/DESIGN.md)

## 구조

```
apps/web        React 19 + Vite PWA. pdf.js 렌더, 필기 엔진, IndexedDB(Dexie) 저장소
apps/api        NestJS 11. 1단계는 health/meta, 2단계에 동기화·Blob presign
packages/shared 도메인 타입 · zod 스키마 · 동기화/백업 계약 (프론트·백엔드 공유)
packages/config 공용 tsconfig
api/index.js    Vercel 서버리스 엔트리. apps/api/dist의 Nest 앱을 불러온다
vercel.json     단일 프로젝트 배포 설정 (빌드 · 출력 · /api rewrite · SPA 폴백)
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

## 배포 (Vercel, 단일 프로젝트)

GitHub `ppdoll/pdf-memo`를 Vercel에 한 번 import하면 된다. Root Directory는 비워 두고(저장소 루트),
Framework Preset은 Other. 나머지는 루트 `vercel.json`이 지정한다.

프로덕션 URL: https://all-read-memo.vercel.app (Vercel 팀 `ppdoll-7834's projects`, 프로젝트 `all-read-memo`; 2026-09-23 이름 변경). 옛 주소 https://pdf-memo-web.vercel.app 는 새 주소로 307 리다이렉트된다. 브라우저 저장소(IndexedDB)는 출처(origin)별이라 옛 주소에 저장한 문서는 새 주소에서 보이지 않으니, 옛 주소에 자료가 있었다면 백업 zip으로 옮겨야 한다.
주의: Root Directory에 값이 들어가면 루트 `vercel.json`이 읽히지 않아 "No Output Directory named dist" 오류로 실패한다. 반드시 비워 둔다.

| 경로     | 처리                                                          |
| -------- | ------------------------------------------------------------- |
| `/api/*` | `api/index.js` 함수 → NestJS (`apps/api/dist`)                |
| 그 외    | `apps/web/dist`의 정적 파일, 파일이 없으면 `index.html` (SPA) |

PR마다 Preview, `main` push마다 Production이 배포된다.

## 단계

- **Phase 0** 모노레포·공용 스키마·저장소 계층·CI·배포 파이프라인 (완료)
- **Phase 1** PDF 가져오기·문서 목록·뷰어·휴지통 (완료), 펜·형광펜·마커·지우개·Undo/Redo (완료), 필기 포함 PDF 내보내기 (완료), 백업 zip·복원 (완료), 텍스트 메모·스티키 노트 (완료), 스티커·사용자 이미지 (완료), 마크다운·텍스트 가져오기 (완료), 이미지 가져오기 (완료), JSON 트리 뷰어·폴더 아이콘 (완료), PWA 설치 배너·카카오 애드핏 광고 (완료) ← 현재, 이어서 도형·PowerPoint 안내
- **Phase 1.5** 스티커·도형·텍스트 형광펜·썸네일·검색
- **Phase 2** 계정 연결, 클라우드 백업·동기화
