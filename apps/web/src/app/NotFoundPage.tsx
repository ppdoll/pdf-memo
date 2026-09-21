import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <p className="text-5xl font-semibold text-slate-300">404</p>
      <p className="mt-3 text-slate-600">페이지를 찾을 수 없습니다.</p>
      <Link to="/" className="mt-6 inline-block text-sm text-indigo-600 hover:underline">
        라이브러리로 돌아가기
      </Link>
    </div>
  );
}
