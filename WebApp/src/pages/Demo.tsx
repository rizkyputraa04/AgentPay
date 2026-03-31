'use client';

import { useState, useEffect, useRef } from "react";
import { Play, Square, ExternalLink, Activity, Bot, Cpu, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface LogEntry {
  event: string;
  message: string;
  data: any;
  timestamp: string;
}

interface Stats {
  totalAgents: number;
  activeAgents: number;
  totalJobs: number;
  walletBalance: number;
  network: string;
  programId: string;
}

const eventColors: Record<string, string> = {
  started: "text-blue-400",
  analyzing: "text-yellow-400",
  analyzed: "text-yellow-300",
  searching: "text-purple-400",
  agents_found: "text-purple-300",
  selecting: "text-orange-400",
  agent_selected: "text-orange-300",
  locking: "text-red-400",
  escrow_created: "text-green-400",
  executing: "text-cyan-400",
  job_completed: "text-green-300",
  completed: "text-emerald-400",
  error: "text-red-500",
};

const eventIcons: Record<string, string> = {
  started: "🚀",
  analyzing: "🧠",
  analyzed: "✓",
  searching: "🔍",
  agents_found: "✓",
  selecting: "🎯",
  agent_selected: "✓",
  locking: "💰",
  escrow_created: "✓",
  executing: "🤖",
  job_completed: "✓",
  completed: "✅",
  error: "✗",
};

const Demo = () => {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [task, setTask] = useState("Analyze the top DeFi protocols on Solana and provide investment insights for Q1 2026");
  const [result, setResult] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadStats();
    loadActivity();
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const loadStats = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/stats");
      const data = await res.json();
      setStats(data);
    } catch {}
  };

  const loadActivity = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/activity");
      const data = await res.json();
      setActivity(data.events || []);
    } catch {}
  };

  const startDemo = () => {
    setLogs([]);
    setResult(null);
    setRunning(true);

    const ws = new WebSocket("ws://localhost:8000/ws/demo");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ task }));
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setLogs(prev => [...prev, data]);

      if (data.event === "completed") {
        setResult(data.data);
        setRunning(false);
        loadStats();
        loadActivity();
      }
      if (data.event === "error") {
        setRunning(false);
      }
    };

    ws.onclose = () => {
      setRunning(false);
    };

    ws.onerror = () => {
      setLogs(prev => [...prev, {
        event: "error",
        message: "Cannot connect to backend. Make sure API is running on port 8000.",
        data: {},
        timestamp: new Date().toLocaleTimeString()
      }]);
      setRunning(false);
    };
  };

  const stopDemo = () => {
    wsRef.current?.close();
    setRunning(false);
  };

  return (
    <div className="container py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">Autonomous Demo</h1>
          <Badge className="bg-primary/20 text-primary border-primary/30">LIVE</Badge>
        </div>
        <p className="text-muted-foreground">
          Watch AI agents autonomously hire other agents and pay with SOL — no human intervention required.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Active Agents", value: stats.activeAgents, icon: <Bot className="w-4 h-4" /> },
            { label: "Jobs Completed", value: stats.totalJobs, icon: <Activity className="w-4 h-4" /> },
            { label: "Wallet Balance", value: `${stats.walletBalance?.toFixed(3)} SOL`, icon: <Zap className="w-4 h-4" /> },
            { label: "Network", value: "Devnet", icon: <Cpu className="w-4 h-4" /> },
          ].map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                {stat.icon} {stat.label}
              </div>
              <div className="text-2xl font-bold text-primary">{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Demo Panel */}
        <div className="col-span-2 space-y-4">
          {/* Task Input */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Task for Orchestrator Agent</h2>
            <div className="flex gap-3">
              <Input
                value={task}
                onChange={(e) => setTask(e.target.value)}
                disabled={running}
                className="flex-1 bg-background font-mono text-sm"
                placeholder="Enter task for autonomous execution..."
              />
              {!running ? (
                <Button onClick={startDemo} className="gap-2 px-6" disabled={!task}>
                  <Play className="w-4 h-4" /> Run Demo
                </Button>
              ) : (
                <Button onClick={stopDemo} variant="destructive" className="gap-2 px-6">
                  <Square className="w-4 h-4" /> Stop
                </Button>
              )}
            </div>
          </div>

          {/* Live Log */}
          <div className="bg-gray-950 border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Live Execution Log
              </h2>
              {running && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs text-primary">Running...</span>
                </div>
              )}
            </div>

            <div className="h-80 overflow-y-auto font-mono text-sm space-y-2">
              {logs.length === 0 && (
                <p className="text-muted-foreground text-center py-8">
                  Click "Run Demo" to start autonomous execution
                </p>
              )}
              {logs.map((log, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-muted-foreground text-xs shrink-0 mt-0.5">{log.timestamp}</span>
                  <span className={eventColors[log.event] || "text-gray-300"}>
                    {eventIcons[log.event] || "→"} {log.message}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="bg-card border border-primary/30 rounded-xl p-5">
              <h2 className="font-semibold mb-4 text-primary flex items-center gap-2">
                ✅ Autonomous Execution Complete
              </h2>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">Worker Agent</p>
                    <p className="font-medium">{result.agent}</p>
                  </div>
                  <div className="bg-background rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">Amount Locked</p>
                    <p className="font-mono text-primary font-bold">{result.amountLocked} SOL</p>
                  </div>
                  <div className="bg-background rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">Job ID</p>
                    <p className="font-mono text-xs">{result.jobId}</p>
                  </div>
                  <div className="bg-background rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">Escrow PDA</p>
                    <p className="font-mono text-xs">{result.escrow?.slice(0, 20)}...</p>
                  </div>
                </div>
                <div className="bg-background rounded-lg p-3">
                  <p className="text-muted-foreground text-xs mb-2">AI Result Preview</p>
                  <p className="text-xs leading-relaxed">{result.resultPreview?.slice(0, 300)}...</p>
                </div>
                <Button asChild variant="outline" className="w-full gap-2">
                  <a href={result.explorerUrl} target="_blank" rel="noreferrer">
                    View Transaction on Solana Explorer <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Activity Feed
              </h2>
              <Button variant="ghost" size="sm" onClick={loadActivity} className="text-xs">
                Refresh
              </Button>
            </div>
            <div className="space-y-3 h-96 overflow-y-auto">
              {activity.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">
                  No activity yet. Run the demo!
                </p>
              ) : (
                activity.map((item) => (
                  <div key={item.id} className="flex gap-3 text-sm border-b border-border pb-3 last:border-0">
                    <span className="text-lg shrink-0">{eventIcons[item.type] || "→"}</span>
                    <div>
                      <p className={`text-xs font-medium ${eventColors[item.type] || "text-gray-300"}`}>
                        {item.message}
                      </p>
                      <p className="text-muted-foreground text-xs mt-0.5">{item.timestamp}</p>
                      {item.data?.explorerUrl && (
                        <a
                          href={item.data.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary text-xs hover:underline mt-1 block"
                        >
                          View on Explorer -&gt;
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Program Info */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
              Protocol Info
            </h2>
            <div className="space-y-2 text-xs">
              <div>
                <p className="text-muted-foreground">Program ID</p>
                <p className="font-mono text-primary break-all">Fpp4D9vg...Axw9h</p>
              </div>
              <div>
                <p className="text-muted-foreground">Network</p>
                <p className="font-mono">Solana Devnet</p>
              </div>
              <div>
                <p className="text-muted-foreground">Protocol Fee</p>
                <p className="font-mono">1% per settlement</p>
              </div>
              <a
                href="https://explorer.solana.com/address/Fpp4D9vgStYwnwoukyFG38n3ZF18pS6kfBbdUdKAxw9h?cluster=devnet"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline block mt-2"
              >
                View Program on Explorer -&gt;
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Demo;
