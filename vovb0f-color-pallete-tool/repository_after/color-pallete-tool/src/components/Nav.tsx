"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";

export default function Nav() {
  const { data: session, status } = useSession();

  return (
    <nav className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-semibold text-lg">
          Color Palette Tool
        </Link>
        <Link href="/gallery" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
          Gallery
        </Link>
        {session && (
          <>
            <Link href="/library" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
              My Library
            </Link>
            <Link href="/collections" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
              Collections
            </Link>
          </>
        )}
      </div>
      <div>
        {status === "loading" ? (
          <span className="text-sm text-slate-500">Loading...</span>
        ) : session ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600 dark:text-slate-400">{session.user?.email}</span>
            <button
              onClick={() => signOut()}
              className="text-sm px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <Link
            href="/auth/signin"
            className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Sign In
          </Link>
        )}
      </div>
    </nav>
  );
}
