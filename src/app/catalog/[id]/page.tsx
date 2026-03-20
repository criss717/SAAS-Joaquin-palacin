import { notFound } from "next/navigation";
import { getMachineWithHierarchy } from "@/lib/actions/catalog-parts";
import { MachineDetailClient, Machine } from "./MachineDetailClient";

export const dynamic = "force-dynamic";

export default async function MachineDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const machine = await getMachineWithHierarchy(id);

  if (!machine) {
    notFound();
  }

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto space-y-6 pt-6 px-4">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Despiece: {machine.name}</h1>
        <p className="text-sm font-medium text-gray-500 mt-1">
          {machine.description || "Gestiona las piezas y operaciones estándar de esta máquina."}
        </p>
      </div>

      {/* Aquí pasamos el objeto serializable completo (sin Date functions anidadas raras, que Prisma maneja bien si hay) */}
      <MachineDetailClient initialMachine={machine as unknown as Machine} /> 
    </div>
  );
}
