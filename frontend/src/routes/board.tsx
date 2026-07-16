import { createFileRoute } from "@tanstack/react-router";
import { FormEvent, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus, MessageSquare, Paperclip, Trash2 } from "lucide-react";


export const Route = createFileRoute("/board")({
  head: () => ({
    meta: [
      { title: "Board — Base" },
      { name: "description", content: "Kanban board for tasks and workflows." },
    ],
  }),
  component: BoardPage,
});

type Task = {
  id: number;
  title: string;
  tag: string;
  tagColor: string;
  comments: number;
  files: number;
  members: string[];
};

const columns: { title: string; count: number; tasks: Task[] }[] = [
  {
    title: "To do",
    count: 3,
    tasks: [
      { id: 1, title: "Design landing hero", tag: "Design", tagColor: "bg-info/15 text-info", comments: 3, files: 2, members: ["EJ", "MK"] },
      { id: 2, title: "Onboarding copy revision", tag: "Content", tagColor: "bg-warning/15 text-warning", comments: 1, files: 0, members: ["AV"] },
      { id: 3, title: "Auth API contract", tag: "Backend", tagColor: "bg-primary/15 text-primary", comments: 5, files: 1, members: ["RH", "SM"] },
    ],
  },
  {
    title: "In progress",
    count: 2,
    tasks: [
      { id: 4, title: "Invoice PDF export", tag: "Feature", tagColor: "bg-success/15 text-success", comments: 8, files: 3, members: ["EJ"] },
      { id: 5, title: "Sidebar collapse animation", tag: "UI", tagColor: "bg-info/15 text-info", comments: 2, files: 0, members: ["MK", "AV"] },
    ],
  },
  {
    title: "Review",
    count: 2,
    tasks: [
      { id: 6, title: "Analytics event tracking", tag: "Data", tagColor: "bg-primary/15 text-primary", comments: 4, files: 1, members: ["CT"] },
      { id: 7, title: "Empty-state illustrations", tag: "Design", tagColor: "bg-info/15 text-info", comments: 0, files: 5, members: ["NK"] },
    ],
  },
  {
    title: "Done",
    count: 2,
    tasks: [
      { id: 8, title: "Password reset flow", tag: "Feature", tagColor: "bg-success/15 text-success", comments: 6, files: 0, members: ["SM", "RH"] },
      { id: 9, title: "Toast notifications", tag: "UI", tagColor: "bg-info/15 text-info", comments: 2, files: 1, members: ["EJ"] },
    ],
  },
];

function BoardPage() {
  const [allColumns, setAllColumns] = useState(columns);
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());

  function toggleTaskSelection(taskId: number) {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
  }

  function deleteSelectedTasks() {
    const confirmed = window.confirm(`Delete ${selectedTasks.size} task(s)?`);
    if (!confirmed) return;

    setAllColumns((prev) =>
      prev.map((col) => ({
        ...col,
        tasks: col.tasks.filter((task) => !selectedTasks.has(task.id)),
        count: col.tasks.filter((task) => !selectedTasks.has(task.id)).length,
      }))
    );

    setSelectedTasks(new Set());
  }

  function addTask(columnTitle: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    
    if (!taskTitle.trim()) return;

    setAllColumns((prev) =>
      prev.map((col) => {
        if (col.title === columnTitle) {
          const newTask: Task = {
            id: Math.max(...col.tasks.map((t) => t.id), 0) + 1,
            title: taskTitle,
            tag: "New",
            tagColor: "bg-gray-200 text-gray-800",
            comments: 0,
            files: 0,
            members: [],
          };
          return { ...col, tasks: [...col.tasks, newTask], count: col.count + 1 };
        }
        return col;
      })
    );

    setTaskTitle("");
    setOpenDialog(null);
  }

  return (
    <AppShell
      title="Board"
      actions={
        <div className="flex items-center gap-2">
          {selectedTasks.size > 0 && (
            <Button variant="destructive" size="sm" onClick={deleteSelectedTasks}>
              <Trash2 className="h-4 w-4" /> Delete ({selectedTasks.size})
            </Button>
          )}
          <Dialog open={openDialog === "global"} onOpenChange={(open) => setOpenDialog(open ? "global" : null)}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> New Task
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={(e) => addTask(allColumns[0].title, e)} className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Create New Task</DialogTitle>
                </DialogHeader>
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Task title..."
                  autoFocus
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpenDialog(null)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {allColumns.map((col) => (
          <div key={col.title} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{col.title}</span>
                <Badge variant="secondary" className="rounded-full">
                  {col.count}
                </Badge>
              </div>
              <Dialog open={openDialog === col.title} onOpenChange={(open) => setOpenDialog(open ? col.title : null)}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={(e) => addTask(col.title, e)} className="space-y-4">
                    <DialogHeader>
                      <DialogTitle>Add task to {col.title}</DialogTitle>
                    </DialogHeader>
                    <Input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="Task title..."
                      autoFocus
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setOpenDialog(null)}>
                        Cancel
                      </Button>
                      <Button type="submit">Add</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2">
              {col.tasks.map((t) => (
                <Card key={t.id} className={`cursor-grab hover:shadow-md transition-shadow ${selectedTasks.has(t.id) ? "ring-2 ring-primary" : ""}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={selectedTasks.has(t.id)}
                        onCheckedChange={() => toggleTaskSelection(t.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Badge className={`${t.tagColor} border-0`}>{t.tag}</Badge>
                        <p className="text-sm font-medium mt-2">{t.title}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex -space-x-2">
                        {t.members.map((m) => (
                          <Avatar key={m} className="h-6 w-6 border-2 border-background">
                            <AvatarFallback className="text-[10px] bg-accent text-accent-foreground">{m}</AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> {t.comments}
                        </span>
                        <span className="flex items-center gap-1">
                          <Paperclip className="h-3 w-3" /> {t.files}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
