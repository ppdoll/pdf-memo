import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { LeftRailAd, MobileBannerAd } from '../features/ads/AdSlots';
import { APP_NAME } from './brand';

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'font-medium text-indigo-600' : 'text-slate-600 hover:text-slate-900';
}

/** 라이브러리·휴지통·설정의 공통 껍데기. 광고는 여기(뷰어 밖)에만 붙는다 */
export function AppLayout() {
  const [mobileAd, setMobileAd] = useState(false);
  return (
    <div className={`min-h-dvh ${mobileAd ? 'pb-20' : ''}`}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <img src="/favicon.svg" alt="" className="h-6 w-6" />
            {APP_NAME}
          </Link>
          <nav className="flex gap-5 text-sm">
            <NavLink to="/" end className={navClass}>
              라이브러리
            </NavLink>
            <NavLink to="/trash" className={navClass}>
              휴지통
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              설정
            </NavLink>
          </nav>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <LeftRailAd />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <MobileBannerAd onFillChange={setMobileAd} />
    </div>
  );
}
