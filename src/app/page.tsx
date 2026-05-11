import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import { getProjects, getTasksByProject, getUsers, getMaterials, getUnitTypes } from "@/lib/actions/tasks";
import { getStagesByProject } from "@/lib/actions/stages";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";

import { cookies } from "next/headers";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const projects = await getProjects();
  const cookieStore = await cookies();
  const activeProjectId = cookieStore.get("activeProjectId")?.value;

  const currentProject = projects.find(p => p.id === activeProjectId) || projects[0];

  const [tasks, stages, users, materials, unitTypes] = currentProject
    ? await Promise.all([
      getTasksByProject(currentProject.id),
      getStagesByProject(currentProject.id),
      getUsers(),
      getMaterials(),
      getUnitTypes()
    ])
    : [[], [], [], [], []];

  const isAdmin = session.user?.role === "ADMIN";

  return (
    <div className="flex-1 p-6 flex flex-col w-full h-[calc(100vh-57px)]">
      <div className="flex-1 overflow-hidden">
        <KanbanBoard
          key={currentProject ? currentProject.id : "empty-board"}
          initialTasks={tasks}
          initialStages={stages}
          users={users}
          isAdmin={isAdmin}
          project={currentProject}
          materials={materials}
          unitTypes={unitTypes}
        />
      </div>
    </div>
  );
}
