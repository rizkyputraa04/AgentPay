import { useState, useEffect } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAgentPay } from "@/hooks/useAgentPay";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const statusColor: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  inProgress: "bg-yellow-500/10 text-yellow-400",
  completed: "bg-blue-500/10 text-blue-400",
  cancelled: "bg-red-500/10 text-red-400",
  pendingReview: "bg-purple-500/10 text-purple-400",
};

interface Job {
  address: string;
  jobId: string;
  orchestrator: string;
  title: string;
  description: string;
  requiredSkills: string[];
  status: string;
  deadline: number;
}

const Jobs = () => {
  const { toast } = useToast();
  const { fetchJobs, postJob, connected, publicKey } = useAgentPay();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", skills: "", output: "", budget: ""
  });

  const loadJobs = async () => {
    setLoading(true);
    try {
      const data = await fetchJobs();
      setJobs(data as Job[]);
    } catch (e) {
      toast({ title: "Error", description: "Gagal memuat jobs", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connected) loadJobs();
  }, [connected]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected) {
      toast({ title: "Wallet belum terconnect", variant: "destructive" });
      return;
    }
    setPosting(true);
    try {
      const jobId = "job-" + Date.now();
      const skills = form.skills.split(",").map(s => s.trim()).filter(Boolean);
      const tx = await postJob(
        jobId,
        form.title,
        form.description,
        skills,
        form.output || "Lihat deskripsi",
        86400
      );
      toast({
        title: "Job berhasil diposting!",
        description: "TX: " + tx.slice(0, 8) + "...",
      });
      setForm({ title: "", description: "", skills: "", output: "", budget: "" });
      setOpen(false);
      await loadJobs();
    } catch (e: any) {
      toast({ title: "Gagal", description: e.message || "Terjadi error", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="container py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Job Board</h1>
          <p className="text-muted-foreground mt-1">
            {connected
              ? jobs.filter(j => j.status === "open").length + " open jobs"
              : "Connect wallet to view jobs"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadJobs} disabled={loading || !connected} className="gap-2">
            <RefreshCw className={"w-4 h-4 " + (loading ? "animate-spin" : "")} />
            Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={!connected}>
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
                  <Label>Description</Label>
                  <Input placeholder="Deskripsi lengkap job ini" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
                </div>
                <div>
                  <Label>Required Skills (comma separated)</Label>
                  <Input placeholder="audit, security, rust" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} required />
                </div>
                <div>
                  <Label>Expected Output</Label>
                  <Input placeholder="Laporan audit PDF" value={form.output} onChange={(e) => setForm({ ...form, output: e.target.value })} />
                </div>
                <Button type="submit" className="w-full" disabled={posting}>
                  {posting ? "Posting..." : "Post Job On-Chain"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!connected ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">Connect your Phantom wallet to view jobs</p>
        </div>
      ) : loading ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">Loading jobs from Devnet...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">No jobs posted yet. Post the first job!</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-5 gap-4 px-6 py-3 border-b border-border text-sm font-medium text-muted-foreground">
            <span>Title</span>
            <span>Required Skills</span>
            <span>Status</span>
            <span>Posted By</span>
            <span>Deadline</span>
          </div>
          {jobs.map((job) => (
            <div key={job.address} className="grid grid-cols-5 gap-4 px-6 py-4 border-b border-border last:border-0 hover:bg-secondary/50 transition-colors items-center">
              <div>
                <p className="font-medium">{job.title}</p>
                <p className="text-xs text-muted-foreground">{job.description?.slice(0, 40)}...</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {job.requiredSkills?.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                ))}
              </div>
              <span>
                <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + (statusColor[job.status] || "")}>
                  {job.status}
                </span>
              </span>
              <span className="font-mono text-sm text-muted-foreground">
                {job.orchestrator?.slice(0, 4)}...{job.orchestrator?.slice(-4)}
              </span>
              <span className="text-sm text-muted-foreground">
                {job.deadline ? new Date(job.deadline * 1000).toLocaleDateString() : "-"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Jobs;