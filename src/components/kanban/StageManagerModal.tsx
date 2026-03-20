"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createStage, updateStage, deleteStage } from "@/lib/actions/stages";
import { Plus, Pencil, Trash2, Check, X, GripVertical } from "lucide-react";
import { toast } from "sonner";

type Stage = { id: string; name: string; color: string; order: number }

const PRESET_COLORS = [
  { hex: "#94a3b8", label: "Gris" },
  { hex: "#3b82f6", label: "Azul" },
  { hex: "#f59e0b", label: "Amarillo" },
  { hex: "#22c55e", label: "Verde" },
  { hex: "#ef4444", label: "Rojo" },
  { hex: "#a855f7", label: "Morado" },
  { hex: "#f97316", label: "Naranja" },
  { hex: "#06b6d4", label: "Cyan" },
];

type Props = {
  open: boolean
  projectId: string
  stages: Stage[]
  onClose: () => void
  onStagesChanged: (stages: Stage[]) => void
  isAdmin: boolean
}

export function StageManagerModal({ open, projectId, stages, onClose, onStagesChanged, isAdmin }: Props) {
  const [localStages, setLocalStages] = useState<Stage[]>(stages);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#94a3b8");
  const [isPending, startTransition] = useTransition();

  const handleStartEdit = (s: Stage) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditColor(s.color);
  };

  const handleSaveEdit = (s: Stage) => {
    startTransition(async () => {
      await updateStage(s.id, { name: editName.trim(), color: editColor });
      const updated = localStages.map(ls =>
        ls.id === s.id ? { ...ls, name: editName.trim(), color: editColor } : ls
      );
      setLocalStages(updated);
      onStagesChanged(updated);
      setEditingId(null);
    });
  };

  const handleDelete = (s: Stage) => {
    startTransition(async () => {
      try {
        await deleteStage(s.id);
        const updated = localStages.filter(ls => ls.id !== s.id);
        setLocalStages(updated);
        onStagesChanged(updated);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Error desconocido');
      }
    });
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    startTransition(async () => {
      const created = await createStage(projectId, newName.trim(), newColor);
      const updated = [...localStages, created];
      setLocalStages(updated);
      onStagesChanged(updated);
      setNewName("");
      setNewColor("#94a3b8");
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Gestionar Etapas del Tablero</DialogTitle>
        </DialogHeader>

        {/* Lista de etapas existentes */}
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {localStages.map(s => (
            <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 bg-gray-50 group">
              <GripVertical size={14} className="text-gray-300 shrink-0" />
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />

              {editingId === s.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="h-7 text-sm flex-1"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c.hex}
                        title={c.label}
                        onClick={() => setEditColor(c.hex)}
                        className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer ${editColor === c.hex ? "border-gray-800" : "border-transparent"}`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                  <button onClick={() => handleSaveEdit(s)} disabled={isPending} className="text-green-600 hover:text-green-700 cursor-pointer">
                    <Check size={15} />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                    <X size={15} />
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-gray-800 flex-1">{s.name}</span>
                  {isAdmin && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStartEdit(s)}
                        className="text-gray-400 hover:text-blue-600 p-0.5 cursor-pointer"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(s)}
                        className="text-gray-400 hover:text-red-500 p-0.5 cursor-pointer"
                        disabled={isPending}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Crear nueva etapa (solo Admin) */}
        {isAdmin && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-gray-700">Nueva etapa</Label>
              <Input
                placeholder="Nombre de la etapa..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                className="text-sm"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Color:</span>
                <div className="flex gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c.hex}
                      title={c.label}
                      onClick={() => setNewColor(c.hex)}
                      className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${newColor === c.hex ? "border-gray-800 scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || isPending}
                className="w-full"
              >
                <Plus size={14} className="mr-1" />
                Añadir Etapa
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
