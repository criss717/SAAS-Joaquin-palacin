import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NextAuthProvider } from "./Providers";
import { Navbar } from "@/components/layout/Navbar";
import { getProjects } from "@/lib/actions/tasks";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gantt Project Decanter",
  description: "Sistema de gestión de fabricación MVP",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  
  let projects: { id: string; name: string }[] = [];
  if (session?.user) {
    projects = await getProjects();
  }

  const cookieStore = await cookies();
  const activeProjectId = cookieStore.get("activeProjectId")?.value || (projects.length > 0 ? projects[0].id : null);

  return (
    <html lang="es">
      <body
        className={`${outfit.className} ${geistMono.variable} antialiased bg-gray-50 flex flex-col min-h-screen`}
      >
        <NextAuthProvider>
          <Navbar projects={projects} activeProjectId={activeProjectId} />
          <main className="flex-1 w-full flex flex-col pt-15">{children}</main>
          <Toaster position="top-center" richColors />
        </NextAuthProvider>
      </body>
    </html>
  );
}
