import { Link, NavLink, Outlet } from 'react-router';

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'font-medium text-indigo-600' : 'text-slate-600 hover:text-slate-900';
}

export function AppLayout() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <img src="/favicon.svg" alt="" className="h-6 w-6" />
            PDF MEMO
          </Link>
          <nav className="flex gap-5 text-sm">
            <NavLink to="/" end className={navClass}>
              라이브러리
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              설정
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
