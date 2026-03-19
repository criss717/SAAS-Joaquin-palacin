import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import { getProjects, getTasksByProject, getUsers } from "@/lib/actions/tasks";
import { getStagesByProject } from "@/lib/actions/stages";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const projects = await getProjects();
  const firstProject = projects[0];
  const [tasks, stages, users] = firstProject
    ? await Promise.all([
        getTasksByProject(firstProject.id),
        getStagesByProject(firstProject.id),
        getUsers(),
      ])
    : [[], [], []];

  const isAdmin = session.user?.role === "ADMIN";

  return (
    <div className="flex-1 p-6 flex flex-col w-full h-[calc(100vh-57px)]">
      <div className="flex justify-between items-center w-full mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Tablero de Producción</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {firstProject
              ? <span>Proyecto: <strong>{firstProject.name}</strong></span>
              : "No hay proyectos creados aún"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <KanbanBoard
          initialTasks={tasks}
          initialStages={stages}
          users={users}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}
