import Link from 'next/link';

export default function Home() {
    return (
        <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white relative overflow-hidden">
            {/* Ambient Background Glows */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />

            {/* Header / Nav */}
            <header className="page-container py-5 sm:py-6 flex justify-between items-center relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <span className="text-xl font-bold tracking-tight bg-linear-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                        ExamProctor <span className="text-indigo-400 font-semibold text-sm px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 ml-1">AI</span>
                    </span>
                </div>
                <div className="flex gap-4">
                    <Link href="/login" className="inline-flex items-center justify-center px-5 py-2 text-sm font-medium text-slate-300 hover:text-white transition duration-200">
                        Sign In
                    </Link>
                    <Link href="/register" className="inline-flex items-center justify-center px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/35 transition duration-200">
                        Register
                    </Link>
                </div>
            </header>

            {/* Hero Section */}
            <div className="page-container page-section flex flex-col items-center text-center relative z-10 flex-1 justify-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-6 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                    Next-Gen Academic Integrity
                </div>
                
                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight md:leading-tight mb-6">
                    AI-Powered Examinations
                    <span className="block mt-2 bg-linear-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
                        With Real-Time Proctoring
                    </span>
                </h1>
                
                <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10 leading-relaxed">
                    A secure, automated examination platform leveraging advanced facial modeling, eye tracking, and smart behavior verification to ensure academic honesty.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 mb-16 sm:mb-20">
                    <Link href="/login" className="inline-flex items-center justify-center px-8 py-4 bg-linear-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-semibold rounded-2xl shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 transition duration-300 transform hover:-translate-y-0.5">
                        Get Started Now
                    </Link>
                    <Link href="/register" className="inline-flex items-center justify-center px-8 py-4 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold rounded-2xl transition duration-300 backdrop-blur-md">
                        Examiner Portal
                    </Link>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 w-full max-w-5xl text-left">
                    {[
                        { 
                            title: "Face Detection", 
                            desc: "Real-time face presence monitoring and verification checks.",
                            icon: (
                                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            )
                        },
                        { 
                            title: "Gaze Tracking", 
                            desc: "AI-powered eye focus analysis and head position tracking.",
                            icon: (
                                <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            )
                        },
                        { 
                            title: "Smart Review", 
                            desc: "Immediate recording and reporting of suspicious events on a neat dashboard.",
                            icon: (
                                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                </svg>
                            )
                        }
                    ].map((f) => (
                        <div key={f.title} className="card-surface p-6 sm:p-7 backdrop-blur-md hover:border-slate-700/80 hover:bg-slate-900/70 transition duration-300 group">
                            <div className="w-12 h-12 rounded-xl bg-slate-950/60 flex items-center justify-center mb-5 border border-slate-800 group-hover:scale-110 transition duration-300">
                                {f.icon}
                            </div>
                            <h3 className="font-semibold text-lg text-slate-100 mb-2 group-hover:text-white transition duration-200">
                                {f.title}
                            </h3>
                            <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <footer className="border-t border-slate-900/80 py-8 sm:py-10 relative z-10 bg-slate-950">
                <div className="page-container flex flex-col sm:flex-row justify-between items-center text-sm text-slate-500 gap-4">
                    <div>© 2026 ExamProctor AI. All rights reserved.</div>
                    <div className="flex gap-6">
                        <a href="#" className="hover:text-slate-300 transition">Terms of Service</a>
                        <a href="#" className="hover:text-slate-300 transition">Privacy Policy</a>
                        <a href="#" className="hover:text-slate-300 transition">Support</a>
                    </div>
                </div>
            </footer>
        </main>
    );
}