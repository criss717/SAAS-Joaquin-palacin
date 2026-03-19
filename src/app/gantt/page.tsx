import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import { getProjects, getTasksByProject } from "@/lib/actions/tasks";
import { GanttChart } from "@/components/gantt/GanttChart";

export default async function GanttPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const projects = await getProjects();
  const firstProject = projects[0];
  const tasks = firstProject ? await getTasksByProject(firstProject.id) : [];

  return (
    <div className="flex-1 p-6 flex flex-col w-full">
      <div className="flex justify-between items-center w-full mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Timeline del Proyecto</h1>
          <p className="text-gray-500 mt-1">
            {firstProject ? (
              <span>Proyecto: <strong>{firstProject.name}</strong></span>
            ) : (
              "No hay proyectos creados aún"
            )}
          </p>
        </div>
      </div>
      <div className="w-full flex-1 min-h-[500px] bg-white border rounded-xl shadow-sm overflow-hidden">
        <GanttChart initialTasks={tasks} />
      </div>
    </div>
  );
}
