"use client";

import { Menu, User, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";

type AppHeaderProps = {
  onMenuClick: () => void;
  title?: string;
  role?: string;
  initials?: string;
  userName?: string;
  email?: string | null;
  subtitle?: string;
};

export function AppHeader({
  onMenuClick,
  title = "Dashboard",
  role = "User",
  initials = "GH",
  userName = role,
  email,
  subtitle,
}: AppHeaderProps) {
  return (
    <header className="flex flex-col gap-2 border-b border-[#EEEEEE] bg-white px-3 py-3 sm:min-h-16 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-0">
      <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center sm:gap-3">
        <button
          type="button"
          aria-label="Buka navigasi"
          className="mt-0.5 shrink-0 rounded-md p-1.5 text-slate-600 hover:bg-[#F3F3F3] sm:mt-0 lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="size-5" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#BF120E]">
              Global Hospitality
            </span>
          </div>
          <h1 className="break-words text-lg font-bold text-[#1B1B1B] sm:text-xl">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 break-words text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>

      <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:shrink-0 sm:justify-end sm:gap-3">
        {/* User Identity & Profile Link */}
        <Link
          href="/profile"
          title={email ? `${userName} (${email})` : "Lihat Profil Saya"}
          className="group flex min-w-0 items-center gap-2.5 rounded-lg p-1.5 transition hover:bg-[#F3F3F3]"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#FFD618] text-xs font-bold text-[#1B1B1B] shadow-xs">
            {initials}
          </span>
          <span className="min-w-0 text-left">
            <span className="block max-w-32 truncate text-xs font-semibold text-[#1B1B1B] transition group-hover:text-[#BF120E] sm:max-w-40">
              {userName}
            </span>
            <span className="hidden text-[11px] text-slate-500 sm:block">{role}</span>
          </span>
        </Link>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 border-l border-[#EEEEEE] pl-2.5">
          <Link
            href="/profile"
            className="hidden items-center gap-1.5 rounded-md border border-[#EEEEEE] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1B1B1B] transition hover:bg-[#F3F3F3] md:inline-flex"
          >
            <User className="size-3.5 text-slate-500" />
            Profil
          </Link>

          <button
            type="button"
            aria-label="Keluar"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#BF120E]"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </div>
    </header>
  );
}
