import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { ArrowRight, Eye, ShieldCheck, Cpu, Terminal } from 'lucide-react';

export default function Home() {
    return (
        <main className="min-h-screen bg-canvas text-primary-text flex flex-col justify-between selection:bg-accent selection:text-white">
            <Navbar showTelemetry={true} />

            {/* Hero Section */}
            <div className="w-full max-w-6xl mx-auto px-6 py-16 md:py-24 flex-1 flex flex-col justify-center">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">

                    {/* Left Column */}
                    <div className="lg:col-span-7 flex flex-col items-start">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-card border border-white/8 text-secondary-text text-xs font-mono mb-6">
                            <span className="w-1.5 h-1.5 rounded-full bg-semantic-positive"></span>
                            <span>System encryption active</span>
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

                    {/* Right Column — Technical Abstract Visual */}
                    <div className="lg:col-span-5 w-full flex items-center justify-center lg:justify-end">
                        <div className="relative w-full max-w-[400px] aspect-square rounded-lg border border-white/8 bg-card overflow-hidden shadow-card">
                            {/* Static Grid & Radar-style visual (No fake numbers) */}
                            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, rgba(237,237,237,0.15) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

                            {/* Centered technical ring */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-48 h-48 rounded-full border border-white/10 flex items-center justify-center relative">
                                    <div className="w-32 h-32 rounded-full border border-white/5" />
                                    <div className="w-64 h-64 rounded-full border border-white/5 absolute" />

                                    {/* Abstract sensor scan line */}
                                    <div className="absolute w-[1px] h-24 bg-gradient-to-t from-accent to-transparent origin-bottom animate-[spin_4s_linear_infinite]" style={{ bottom: '50%' }} />

                                    {/* Static technical markers */}
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full pb-2">
                                        <div className="w-[1px] h-4 bg-white/20" />
                                    </div>
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full pt-2">
                                        <div className="w-[1px] h-4 bg-white/20" />
                                    </div>
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pr-2">
                                        <div className="h-[1px] w-4 bg-white/20" />
                                    </div>
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-2">
                                        <div className="h-[1px] w-4 bg-white/20" />
                                    </div>
                                </div>
                            </div>

                            {/* Status label without fake data */}
                            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center px-3 py-2 bg-deep/80 border border-white/8 rounded-md">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-semantic-positive" />
                                    <span className="text-[10px] font-mono text-muted-text uppercase tracking-wider">Interface verified</span>
                                </div>
                                <ShieldCheck className="w-3.5 h-3.5 text-muted-text" strokeWidth={1.5} />
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
                        <div className="p-6 rounded-md bg-card border border-white/8">
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

                        <div className="p-6 rounded-md bg-card border border-white/8">
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

                        <div className="p-6 rounded-md bg-card border border-white/8">
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
