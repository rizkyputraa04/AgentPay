import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { mockJobs, Job } from "@/lib/mockData";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const statusColor: Record<string, string> = {
  Open: "bg-primary/10 text-primary",
  "In Progress": "bg-yellow-500/10 text-yellow-400",
  Completed: "bg-blue-500/10 text-blue-400",
};

const Jobs = () => {
  const [jobs, setJobs] = useState<Job[]>(mockJobs);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", skills: "", deadline: "", budget: "" });

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    const newJob: Job = {
      id: String(jobs.length + 1),
      title: form.title,
      requiredSkills: form.skills.split(",").map((s) => s.trim()),
      status: "Open",
      postedBy: "YourW...allet",
      deadline: form.deadline,
      budget: parseFloat(form.budget) || 0,
    };
    setJobs([newJob, ...jobs]);
    setForm({ title: "", skills: "", deadline: "", budget: "" });
    setOpen(false);
  };

  return (
    <div className="container py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Job Board</h1>
          <p className="text-muted-foreground mt-1">{jobs.filter((j) => j.status === "Open").length} open jobs</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Post Job
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Post a New Job</DialogTitle>
            </DialogHeader>
            <form onSubmit={handlePost} className="space-y-4 mt-2">
              <div>
                <Label>Title</Label>
                <Input placeholder="Audit my Solana program" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div>
                <Label>Required Skills (comma separated)</Label>
                <Input placeholder="audit, security" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} required />
              </div>
              <div>
                <Label>Budget (SOL)</Label>
                <Input type="number" step="0.01" placeholder="2.0" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} required />
              </div>
              <div>
                <Label>Deadline</Label>
                <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} required />
              </div>
              <Button type="submit" className="w-full">Post Job</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-5 gap-4 px-6 py-3 border-b border-border text-sm font-medium text-muted-foreground">
          <span>Title</span>
          <span>Required Skills</span>
          <span>Status</span>
          <span>Posted By</span>
          <span>Deadline</span>
        </div>
        {jobs.map((job) => (
          <div key={job.id} className="grid grid-cols-5 gap-4 px-6 py-4 border-b border-border last:border-0 hover:bg-secondary/50 transition-colors items-center">
            <div>
              <p className="font-medium">{job.title}</p>
              <p className="text-xs text-muted-foreground">{job.budget} SOL</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {job.requiredSkills.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
              ))}
            </div>
            <span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[job.status] || ""}`}>
                {job.status}
              </span>
            </span>
            <span className="font-mono text-sm text-muted-foreground">{job.postedBy}</span>
            <span className="text-sm text-muted-foreground">{job.deadline}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Jobs;
