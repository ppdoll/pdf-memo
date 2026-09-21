// Vercel Serverless Function 엔트리.
// NestJS 소스를 직접 import하지 않고 `nest build`(tsc) 결과물인 dist/를 불러온다.
// Vercel의 TS 번들러는 emitDecoratorMetadata를 보장하지 않아 DI가 깨질 수 있기 때문이다.
const { createApp } = require('../dist/bootstrap');

/** 인스턴스가 재사용되는 동안 Nest 앱을 한 번만 부트스트랩한다 */
let serverPromise;

module.exports = async (req, res) => {
  serverPromise ??= createApp();
  const server = await serverPromise;
  server(req, res);
};
