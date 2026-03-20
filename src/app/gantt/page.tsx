import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import { getProjects, getTasksByProject } from "@/lib/actions/tasks";
import { GanttChart } from "@/components/gantt/GanttChart";

import { cookies } from "next/headers";

export default async function GanttPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const projects = await getProjects();
  const cookieStore = await cookies();
  const activeProjectId = cookieStore.get("activeProjectId")?.value;
  
  const currentProject = projects.find(p => p.id === activeProjectId) || projects[0];
  const tasks = currentProject ? await getTasksByProject(currentProject.id) : [];

  return (
    <div className="flex-1 p-6 flex flex-col w-full">
      <div className="flex justify-between items-center w-full mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Timeline del Proyecto</h1>
          <p className="text-gray-500 mt-1">
            {currentProject ? (
              <span>Proyecto: <strong>{currentProject.name}</strong></span>
            ) : (
              "No hay proyectos creados aún"
            )}
          </p>
        </div>
      </div>
      <div className="w-full flex-1 min-h-[500px] bg-white border rounded-xl shadow-sm overflow-hidden">
        <GanttChart key={currentProject ? currentProject.id : "empty-gantt"} initialTasks={tasks} />
      </div>
    </div>
  );
}
