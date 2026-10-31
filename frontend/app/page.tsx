import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { ArrowRight, Eye, ShieldCheck, Cpu, Terminal, CheckCircle2 } from 'lucide-react';

export default function Home() {
    return (
        <main className="min-h-screen bg-canvas text-primary-text flex flex-col justify-between selection:bg-accent selection:text-white">
            <Navbar showTelemetry={true} />

            {/* Asymmetric Hero Section */}
            <div className="w-full max-w-6xl mx-auto px-6 py-16 md:py-24 flex-1 flex flex-col justify-center">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
                    
                    {/* Left Column: Clear, Non-Hype Headline & Actions */}
                    <div className="lg:col-span-7 flex flex-col items-start">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-card border border-white/8 text-secondary-text text-xs font-mono mb-6">
                            <span className="w-1.5 h-1.5 rounded-full bg-semantic-positive"></span>
                            <span>Continuous exam telemetry v2.4</span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-medium tracking-tight text-primary-text leading-[1.08] mb-6">
                            Automated integrity monitoring for online examinations
                        </h1>

                        <p className="text-base sm:text-lg text-secondary-text max-w-xl mb-8 leading-relaxed">
                            Continuous facial detection, gaze vector estimation, and system focus logging to verify remote candidates directly in modern web browsers.
                        </p>

                        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                            <Link
                                href="/login"
                                className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-primary-text hover:bg-white text-canvas text-sm font-medium transition-colors"
                            >
                                <span>Sign in to exam</span>
                                <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                            </Link>
                            <Link
                                href="/register"
                                className="inline-flex items-center justify-center h-11 px-5 rounded-md border border-white/8 bg-card hover:bg-raised text-primary-text text-sm font-medium transition-colors"
                            >
                                Examiner registration
                            </Link>
                        </div>

                        {/* Factual spec tags */}
                        <div className="grid grid-cols-3 gap-6 pt-10 mt-10 border-t border-white/8 w-full max-w-lg text-xs font-mono text-muted-text">
                            <div>
                                <span className="block text-sm font-medium text-primary-text tabular-nums">0 MB</span>
                                <span className="text-[11px]">No plugins required</span>
                            </div>
                            <div>
                                <span className="block text-sm font-medium text-primary-text tabular-nums">2.0s</span>
                                <span className="text-[11px]">Telemetry intervals</span>
                            </div>
                            <div>
                                <span className="block text-sm font-medium text-primary-text tabular-nums">FERPA</span>
                                <span className="text-[11px]">Compliant logging</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: The Polished Product Telemetry Moment */}
                    <div className="lg:col-span-5 w-full">
                        <div className="rounded-xl border border-white/8 bg-deep overflow-hidden shadow-xl">
                            {/* Terminal Window Header */}
                            <div className="px-4 py-2.5 bg-canvas border-b border-white/8 flex items-center justify-between text-xs font-mono text-muted-text">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-raised" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-raised" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-raised" />
                                    <span className="text-[11px] text-secondary-text ml-2">monitor://session-live</span>
                                </div>
                                <span className="text-semantic-positive text-[10px] tracking-wider uppercase">Active sensor</span>
                            </div>

                            {/* Simulated Proctoring Stream */}
                            <div className="p-4 bg-card relative">
                                <div className="h-44 rounded-lg bg-deep border border-white/8 relative overflow-hidden flex items-center justify-center">
                                    {/* Camera wireframe mock */}
                                    <div className="absolute inset-4 border border-dashed border-accent/40 rounded flex flex-col justify-between p-2 font-mono text-[9px] text-accent/80">
                                        <div className="flex justify-between">
                                            <span>FACE_BOUNDS [318, 142, 220, 240]</span>
                                            <span>CONF: 99.4%</span>
                                        </div>
                                        <div className="self-center w-20 h-24 border border-white/20 rounded-full flex items-center justify-center">
                                            <div className="w-1.5 h-1.5 rounded-full bg-semantic-positive" />
                                        </div>
                                        <div className="flex justify-between">
                                            <span>GAZE: CENTER</span>
                                            <span>YAW: -1.2° PITCH: +0.4°</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Live Telemetry Log Lines */}
                            <div className="p-4 bg-deep border-t border-white/8 font-mono text-xs space-y-2">
                                <div className="flex items-center justify-between text-[11px] text-muted-text pb-1 border-b border-white/4">
                                    <span>EVENT FEED</span>
                                    <span>TIMESTAMP</span>
                                </div>
                                <div className="flex items-center justify-between text-secondary-text">
                                    <span className="flex items-center gap-1.5 truncate">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-semantic-positive shrink-0" strokeWidth={1.5} />
                                        <span>Candidate identity verified</span>
                                    </span>
                                    <span className="text-muted-text text-[10px] tabular-nums">14:02:11.04</span>
                                </div>
                                <div className="flex items-center justify-between text-secondary-text">
                                    <span className="flex items-center gap-1.5 truncate">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-semantic-positive shrink-0" strokeWidth={1.5} />
                                        <span>Full display capture established</span>
                                    </span>
                                    <span className="text-muted-text text-[10px] tabular-nums">14:02:13.20</span>
                                </div>
                                <div className="flex items-center justify-between text-secondary-text">
                                    <span className="flex items-center gap-1.5 truncate">
                                        <span className="w-1.5 h-1.5 rounded-full bg-accent ml-1 shrink-0" />
                                        <span className="ml-1">Telemetry stream synchronized</span>
                                    </span>
                                    <span className="text-muted-text text-[10px] tabular-nums">14:02:15.33</span>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Structured Architectural Modules */}
                <div className="mt-24 pt-16 border-t border-white/8">
                    <div className="text-xs font-mono text-muted-text uppercase tracking-wider mb-8">
                        Verification pipeline
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-6 rounded-lg bg-card border border-white/8">
                            <div className="w-8 h-8 rounded-md bg-raised border border-white/8 flex items-center justify-center mb-4">
                                <Eye className="w-4 h-4 text-primary-text" strokeWidth={1.5} />
                            </div>
                            <h3 className="text-sm font-medium text-primary-text mb-1.5">
                                Facial presence & head pose
                            </h3>
                            <p className="text-xs text-secondary-text leading-relaxed">
                                Continuous landmark detection verifies candidate presence and flags multiple occupants or prolonged gaze diversion.
                            </p>
                        </div>

                        <div className="p-6 rounded-lg bg-card border border-white/8">
                            <div className="w-8 h-8 rounded-md bg-raised border border-white/8 flex items-center justify-center mb-4">
                                <Terminal className="w-4 h-4 text-primary-text" strokeWidth={1.5} />
                            </div>
                            <h3 className="text-sm font-medium text-primary-text mb-1.5">
                                System & window interceptors
                            </h3>
                            <p className="text-xs text-secondary-text leading-relaxed">
                                Enforces full-screen lockdowns and detects tab changes, clipboard shortcuts, auxiliary displays, and developer consoles.
                            </p>
                        </div>

                        <div className="p-6 rounded-lg bg-card border border-white/8">
                            <div className="w-8 h-8 rounded-md bg-raised border border-white/8 flex items-center justify-center mb-4">
                                <Cpu className="w-4 h-4 text-primary-text" strokeWidth={1.5} />
                            </div>
                            <h3 className="text-sm font-medium text-primary-text mb-1.5">
                                Examiner telemetry reviews
                            </h3>
                            <p className="text-xs text-secondary-text leading-relaxed">
                                Flagged sessions populate directly into examiner review feeds with verifiable timestamps and captured frame snapshots.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quiet Footer */}
            <footer className="border-t border-white/8 bg-deep py-6 text-xs text-muted-text">
                <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-muted-text" strokeWidth={1.5} />
                        <span>ExamProctor academic integrity platform</span>
                    </div>
                    <div className="flex gap-6 font-mono text-[11px]">
                        <span>FERPA</span>
                        <span>GDPR COMPLIANT</span>
                        <span>SOC2 READY</span>
                    </div>
                </div>
            </footer>
        </main>
    );
}
