'use client'

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FileText, Brain, Search, Sparkles, Zap } from "lucide-react";

const stages = [
  { icon: FileText, title: "Reading your data...", description: "Parsing CSV and extracting session information" },
  { icon: Brain, title: "Training AI model...", description: "Building neural networks on your club patterns" },
  { icon: Search, title: "Finding patterns...", description: "Analyzing occupancy trends and player behavior" },
  { icon: Sparkles, title: "Generating insights...", description: "Creating actionable recommendations" },
  { icon: Zap, title: "Ready!", description: "Your AI advisor is now trained and ready" },
];

const matrixChars = "01アイウエオカキクケコサシスセソタチツテトナニヌネノ";
const terminalLines = [
  "> Initializing neural cortex v4.2...",
  "> Loading session embeddings [247/247]",
  "> Building attention layers [12/12]",
  "> Calibrating player vectors...",
  "> Indexing behavioral patterns...",
  "> Training transformer model [3/3]",
  "> Optimizing inference pipeline...",
  "> Validating accuracy: 97.3%",
  "> Syncing knowledge graph...",
  "> System ready.",
];

type Props = {
  onComplete?: () => void;
  /** External progress 0-100. When provided, controls the progress bar and stage instead of timer. */
  progress?: number;
  /** External status message to show in terminal */
  statusMessage?: string;
  /** When true, animation waits for external signal instead of auto-completing */
  waitForCompletion?: boolean;
};

export function AILoadingAnimation({ onComplete, progress: externalProgress, statusMessage, waitForCompletion }: Props) {
  const [currentStage, setCurrentStage] = useState(0);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; size: number; delay: number }>>([]);
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [matrixRain, setMatrixRain] = useState<Array<{ id: number; x: number; char: string; speed: number }>>([]);
  const [internalDone, setInternalDone] = useState(false);

  // Auto-advance stages with timer (when no external progress)
  useEffect(() => {
    if (externalProgress !== undefined) return; // controlled externally
    const stageInterval = setInterval(() => {
      setCurrentStage((prev) => {
        if (prev < stages.length - 1) return prev + 1;
        clearInterval(stageInterval);
        return prev;
      });
    }, 1600);
    return () => clearInterval(stageInterval);
  }, [externalProgress]);

  // Sync stage from external progress
  useEffect(() => {
    if (externalProgress === undefined) return;
    const stageIdx = Math.min(Math.floor((externalProgress / 100) * stages.length), stages.length - 1);
    setCurrentStage(stageIdx);
  }, [externalProgress]);

  // Add external status messages to terminal
  useEffect(() => {
    if (statusMessage) {
      setVisibleLines((prev) => [...prev.slice(-7), `> ${statusMessage}`]);
    }
  }, [statusMessage]);

  // Call onComplete when done
  useEffect(() => {
    if (waitForCompletion && externalProgress !== undefined) {
      // Wait for external progress to reach 100
      if (externalProgress >= 100 && !internalDone) {
        setInternalDone(true);
        setCurrentStage(stages.length - 1);
        if (onComplete) {
          const t = setTimeout(onComplete, 1200);
          return () => clearTimeout(t);
        }
      }
    } else if (currentStage === stages.length - 1 && onComplete && !internalDone) {
      setInternalDone(true);
      const t = setTimeout(onComplete, 1200);
      return () => clearTimeout(t);
    }
  }, [currentStage, onComplete, externalProgress, waitForCompletion, internalDone]);

  // Terminal lines
  useEffect(() => {
    let lineIdx = 0;
    const interval = setInterval(() => {
      if (lineIdx < terminalLines.length) {
        setVisibleLines((prev) => [...prev.slice(-5), terminalLines[lineIdx]]);
        lineIdx++;
      }
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Particles
  useEffect(() => {
    const interval = setInterval(() => {
      setParticles((prev) => {
        const next = prev.length > 30 ? prev.slice(1) : prev;
        return [...next, { id: Date.now() + Math.random(), x: Math.random() * 100, y: Math.random() * 100, size: Math.random() * 3 + 1, delay: Math.random() * 0.5 }];
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Matrix rain
  useEffect(() => {
    const interval = setInterval(() => {
      setMatrixRain((prev) => {
        const next = prev.length > 40 ? prev.slice(1) : prev;
        return [...next, { id: Date.now() + Math.random(), x: Math.random() * 100, char: matrixChars[Math.floor(Math.random() * matrixChars.length)], speed: Math.random() * 2 + 1 }];
      });
    }, 80);
    return () => clearInterval(interval);
  }, []);

  const progress = Math.min(externalProgress !== undefined ? externalProgress : ((currentStage + 1) / stages.length) * 100, 100);

  return (
    <div className="flex flex-col gap-5 max-w-4xl mx-auto">
      {/* Neural Network Visualization — compact */}
      <div className="relative h-[260px] rounded-2xl overflow-hidden flex-shrink-0" style={{
        background: "linear-gradient(180deg, #080A14, #0B0D17)",
        border: "1px solid rgba(139, 92, 246, 0.15)",
      }}>
        {/* Grid */}
        <div className="absolute inset-0 opacity-[0.05]" style={{
          backgroundImage: "linear-gradient(to right, #8B5CF6 1px, transparent 1px), linear-gradient(to bottom, #8B5CF6 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }} />

        {/* Matrix Rain */}
        <AnimatePresence>
          {matrixRain.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: "-10%" }}
              animate={{ opacity: [0, 0.6, 0], y: "110%" }}
              exit={{ opacity: 0 }}
              transition={{ duration: item.speed * 2, ease: "linear" }}
              className="absolute text-sm font-mono"
              style={{ left: `${item.x}%`, color: "#8B5CF6", textShadow: "0 0 8px rgba(139, 92, 246, 0.8)" }}
            >
              {item.char}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Particles */}
        <AnimatePresence>
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, scale: 0, x: `${p.x}%`, y: "100%" }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0, 1, 1, 0], y: "-20%" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.5, ease: "easeOut", delay: p.delay }}
              className="absolute rounded-full"
              style={{
                width: p.size, height: p.size,
                background: `radial-gradient(circle, ${p.id % 2 ? "#8B5CF6" : "#06B6D4"}, transparent)`,
                boxShadow: `0 0 ${p.size * 4}px ${p.id % 2 ? "rgba(139,92,246,0.8)" : "rgba(6,182,212,0.8)"}`,
              }}
            />
          ))}
        </AnimatePresence>

        {/* Central Core */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div animate={{ scale: [1, 1.05, 1], opacity: [0.9, 1, 0.9] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="relative">
            {/* Outer rings */}
            {[0, 1, 2].map((i) => (
              <motion.div key={i} animate={{ rotate: i % 2 === 0 ? 360 : -360 }} transition={{ duration: 10 + i * 4, repeat: Infinity, ease: "linear" }} className="absolute rounded-full" style={{ inset: -(20 + i * 22), border: `1px solid rgba(139, 92, 246, ${0.2 - i * 0.05})` }} />
            ))}

            {/* Glow */}
            <div className="absolute inset-0 rounded-full blur-2xl scale-[2]" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.25), rgba(6,182,212,0.1), transparent)" }} />

            {/* Core */}
            <div className="relative w-24 h-24 rounded-full flex items-center justify-center" style={{
              background: "linear-gradient(135deg, #8B5CF6, #6D28D9, #06B6D4)",
              boxShadow: "0 0 50px rgba(139, 92, 246, 0.6), 0 0 100px rgba(6, 182, 212, 0.25)",
            }}>
              <Brain className="w-12 h-12 text-white" />
            </div>

            {/* Orbiting nodes */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <motion.div key={i} animate={{ rotate: 360 }} transition={{ duration: 5 + i * 0.6, repeat: Infinity, ease: "linear", delay: i * 0.4 }} className="absolute inset-0">
                <div className="absolute rounded-full" style={{
                  width: 6 - (i % 3), height: 6 - (i % 3), top: "50%", left: "50%",
                  transform: `translate(-50%, -50%) translateY(-${55 + i * 10}px)`,
                  background: i % 2 === 0 ? "linear-gradient(135deg, #8B5CF6, #A78BFA)" : "linear-gradient(135deg, #06B6D4, #22D3EE)",
                  boxShadow: i % 2 === 0 ? "0 0 12px rgba(139,92,246,0.8)" : "0 0 12px rgba(6,182,212,0.8)",
                }} />
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Synaptic connections */}
        <svg className="absolute inset-0 w-full h-full">
          {[...Array(12)].map((_, i) => (
            <motion.line
              key={i}
              x1={`${10 + Math.random() * 80}%`} y1={`${10 + Math.random() * 80}%`}
              x2="50%" y2="50%"
              stroke={i % 2 === 0 ? "rgba(139,92,246,0.2)" : "rgba(6,182,212,0.15)"}
              strokeWidth="1"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, 1, 0], opacity: [0, 0.6, 0] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
            />
          ))}
        </svg>
      </div>

      {/* Progress + current stage — side by side */}
      <div className="flex items-center gap-4">
        {/* Stage icon */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStage}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.25 }}
            className="w-13 h-13 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", boxShadow: "0 4px 16px rgba(139, 92, 246, 0.35)" }}
          >
            {(() => { const Icon = stages[currentStage].icon; return <Icon className="w-6 h-6 text-white" />; })()}
          </motion.div>
        </AnimatePresence>

        {/* Progress bar + label */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.p
              key={currentStage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="text-sm mb-1.5 truncate"
              style={{ fontWeight: 600, color: "var(--heading)" }}
            >
              {stages[currentStage].title}
            </motion.p>
          </AnimatePresence>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
            <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} style={{ background: "linear-gradient(90deg, #8B5CF6, #06B6D4)", boxShadow: "0 0 12px rgba(139, 92, 246, 0.5)" }} />
          </div>
        </div>

        {/* Percentage */}
        <div className="text-sm font-mono flex-shrink-0" style={{ fontWeight: 700, color: "var(--t3)", minWidth: 36, textAlign: "right" }}>
          {Math.round(progress)}%
        </div>
      </div>

      {/* Stage indicators strip */}
      <div className="flex items-center gap-2">
        {stages.map((stage, idx) => {
          const Icon = stage.icon;
          const isComplete = idx < currentStage;
          const isCurrent = idx === currentStage;
          return (
            <motion.div
              key={idx}
              className="flex-1 flex items-center gap-1.5 rounded-xl px-2 py-2"
              animate={isCurrent ? { scale: [1, 1.02, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{
                background: isComplete
                  ? "rgba(16, 185, 129, 0.12)"
                  : isCurrent
                  ? "rgba(139, 92, 246, 0.15)"
                  : "rgba(255,255,255,0.03)",
                border: `1px solid ${isComplete ? "rgba(16,185,129,0.2)" : isCurrent ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.05)"}`,
              }}
            >
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                background: isComplete ? "linear-gradient(135deg, #10B981, #059669)" : isCurrent ? "linear-gradient(135deg, #8B5CF6, #06B6D4)" : "transparent",
              }}>
                <Icon className={`w-3.5 h-3.5 ${isComplete || isCurrent ? "text-white" : "text-white/20"}`} />
              </div>
              <span className="text-xs truncate hidden sm:block" style={{ fontWeight: isCurrent ? 600 : 400, color: isCurrent ? "var(--t1)" : isComplete ? "rgba(16,185,129,0.8)" : "var(--t5)" }}>
                {stage.title.replace("...", "")}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Terminal — compact */}
      <div className="rounded-2xl px-4 py-3 font-mono text-xs overflow-hidden flex-shrink-0" style={{ background: "rgba(8, 10, 20, 0.9)", border: "1px solid rgba(139, 92, 246, 0.1)" }}>
        <div className="flex items-center gap-1.5 mb-2 pb-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
          <span className="text-[10px] text-white/20 ml-1.5">iqsport-ai-engine</span>
        </div>
        <div className="space-y-1">
          {visibleLines.filter(Boolean).slice(-4).map((line, idx, arr) => (
            <motion.div
              key={`${line}-${idx}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                color: (line || '').includes("ready") || (line || '').includes("97.3") ? "#06B6D4" : "#8B5CF6",
                textShadow: `0 0 8px ${(line || '').includes("ready") ? "rgba(6,182,212,0.5)" : "rgba(139,92,246,0.3)"}`,
              }}
            >
              {line}
              {idx === arr.length - 1 && (
                <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.8, repeat: Infinity }} className="ml-0.5">|</motion.span>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
