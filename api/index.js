// Vercel Serverless Function 엔트리 (단일 프로젝트 배포: web 정적 파일 + 이 함수).
// NestJS 소스를 직접 import하지 않고 `nest build`(tsc) 결과물 apps/api/dist를 불러온다.
// Vercel의 TS 번들러는 emitDecoratorMetadata를 보장하지 않아 DI가 깨질 수 있기 때문이다.
// 루트 vercel.json의 rewrite가 /api/* 요청을 이 함수로 보내고, Nest는 원래 경로(/api/v1/...)를 그대로 받는다.
const { createApp } = require('../apps/api/dist/bootstrap');

/** 함수 인스턴스가 재사용되는 동안 Nest 앱을 한 번만 부트스트랩한다 */
let serverPromise;

module.exports = async (req, res) => {
  serverPromise ??= createApp();
  const server = await serverPromise;
  server(req, res);
};
