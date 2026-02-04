import { BoardClient } from "@/components/BoardClient";
import { listTasksAction } from "@/actions/tasks";

export default async function HomePage() {
  const res = await listTasksAction();
  return <BoardClient initialTasks={res.ok ? res.data : []} />;
}
