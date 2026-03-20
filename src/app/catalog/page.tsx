import { getMachines } from "@/lib/actions/catalog";
import { CatalogClient } from "./CatalogClient";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const machines = await getMachines();

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto space-y-6 pt-6 px-4">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Catálogo de Máquinas (Lista de materiales)</h1>
        <p className="text-sm font-medium text-gray-500 mt-1">
          Gestiona las plantillas, despieces y operaciones estándar.
        </p>
      </div>

      <CatalogClient initialMachines={machines} />
    </div>
  );
}
