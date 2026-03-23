"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    if (res?.error) {
      setError("Credenciales incorrectas. Revisa tu email y contraseña.");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-linear-to-br from-slate-950 via-blue-950 to-slate-900 p-4 relative overflow-hidden">
      {/* Elementos decorativos de fondo */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-[440px] z-10 space-y-8 animate-in fade-in zoom-in duration-700">
        <div className="flex flex-col items-center space-y-4">
          <div className="relative w-48 h-20 mb-2">
            <Image
              src="/logoblanco.png"
              alt="Logo Joaquin Palacin"
              fill
              className="object-contain drop-shadow-2xl"
              priority
            />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-white tracking-tight">Gestión de planta</h1>
            <p className="text-blue-200/60 text-sm font-medium uppercase tracking-[0.2em]">Joaquin Palacin S.L. - ERP</p>
          </div>
        </div>

        <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl rounded-[2rem] overflow-hidden">
          <CardContent className="p-8 pt-10">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-blue-200/50 ml-1">
                  Correo Corporativo
                </Label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-300/30 group-focus-within:text-blue-400 transition-colors" size={18} />
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@jpalacin.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 pl-11 rounded-2xl focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-medium"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-blue-200/50 ml-1">
                  Contraseña Segura
                </Label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-300/30 group-focus-within:text-blue-400 transition-colors" size={18} />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 pl-11 pr-12 rounded-2xl focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors p-1"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold animate-in slide-in-from-top-2">
                  <ShieldCheck size={14} className="shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-blue-100 hover:bg-blue-200 text-blue-700 font-black text-sm rounded-2xl shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Verificando...
                  </span>
                ) : (
                  "Iniciar Sesión"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center pt-2">
          <p className="text-white/20 text-[10px] font-bold uppercase tracking-[0.3em]">
            © {new Date().getFullYear()} Joaquin Palacin S.L. - Sistema de Gestión de Planta
          </p>
        </div>
      </div>
    </div>
  );
}
