"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProjectSelector } from "./ProjectSelector";

type MinProject = { id: string; name: string };
export function Navbar({ projects = [], activeProjectId = null }: { projects?: MinProject[], activeProjectId?: string | null }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const navLink = (href: string, label: string) => (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${pathname === href
        ? "bg-gray-100 text-gray-900"
        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
        }`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="border-b w-full bg-white px-4 py-3 fixed">
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/" className="font-bold text-xl tracking-tight text-gray-900">
            Joaquin<span className="text-blue-600"> Palacin</span>
          </Link>
          
          {session && (
            <div className="ml-4 pl-4 border-l border-gray-200 hidden sm:block">
              <ProjectSelector projects={projects} activeProjectId={activeProjectId} />
            </div>
          )}

          {session && (
            <div className="hidden lg:flex space-x-1 ml-4 border-l border-gray-200 pl-4">
              {navLink("/", "Tablero Kanban")}
              {navLink("/gantt", "Gantt")}
              {session.user?.role === "ADMIN" && navLink("/catalog", "Catálogo")}
              {session.user?.role === "ADMIN" && navLink("/admin/schedule", "Calendario")}
              {session.user?.role === "ADMIN" && navLink("/admin", "Administración")}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-4">
          {session ? (
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-600 font-medium hidden sm:block">
                {session.user?.name}
                <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
                  {session.user?.role}
                </span>
              </span>
              <Button className="cursor-pointer" variant="outline" onClick={() => signOut()}>
                Salir
              </Button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex cursor-pointer items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
            >
              Iniciar Sesión
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

