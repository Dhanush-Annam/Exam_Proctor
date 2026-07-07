'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getExams } from '@/lib/api';
import Link from 'next/link';

export interface ExamListPageProps {
    readonly params?: any;
}

export default function ExamListPage({ params }: ExamListPageProps) {
    const router = useRouter();
    const [exams, setExams] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (!stored) {
            router.push('/login');
            return;
        }
        setUser(JSON.parse(stored));

        getExams()
            .then(res => setExams(res.data))
            .catch(() => router.push('/login'))
            .finally(() => setLoading(false));
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-slate-400 font-medium text-sm">Loading available examinations...</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden">
            {/* Background Glow Blobs */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />

            {/* Top Navigation Header */}
            <header className="bg-slate-900/60 border-b border-slate-800/80 backdrop-blur-xl sticky top-0 z-50 px-6 h-16 flex justify-between items-center shrink-0">
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition duration-200">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <span className="text-xl font-bold tracking-tight bg-linear-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent flex items-center">
                        ExamProctor <span className="text-indigo-400 font-semibold text-sm px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 ml-1.5">AI</span>
                    </span>
                </Link>

                {user && (
                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex flex-col text-right">
                            <span className="text-xs font-semibold text-slate-200">{user.name}</span>
                            <span className="text-[10px] text-slate-500">{user.email}</span>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white px-3.5 py-1.5 rounded-xl border border-slate-800 text-xs font-semibold transition cursor-pointer"
                        >
                            Sign Out
                        </button>
                    </div>
                )}
            </header>

            {/* Main Content Area */}
            <main className="flex-1 p-6 md:p-12 relative z-10 max-w-4xl mx-auto w-full">
                <div className="mb-10">
                    <h1 className="text-3xl font-extrabold text-white leading-tight">Available Examinations</h1>
                    <p className="text-slate-400 text-sm mt-1">Please select an active examination module below to begin.</p>
                </div>

                {exams.length === 0 ? (
                    <div className="glass-card rounded-2xl p-12 text-center border border-outline-variant/30 shadow-2xl">
                        <p className="text-slate-400 font-medium">No active examinations are currently available.</p>
                        <p className="text-slate-500 text-xs mt-1">Please contact your administrator or proctor to assign modules.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {exams.map((exam: any) => (
                            <div
                                key={exam.id}
                                className="glass-card rounded-2xl p-6 border border-outline-variant/30 flex flex-col sm:flex-row justify-between sm:items-center gap-5 hover:border-outline-variant/50 hover:shadow-lg transition-all duration-300 border-l-4 border-l-primary"
                            >
                                <div className="space-y-1">
                                    <h2 className="font-bold text-slate-100 text-lg">
                                        {exam.title}
                                    </h2>
                                    <div className="flex gap-4 text-xs font-semibold uppercase text-slate-500 tracking-wider pt-1">
                                        <span className="text-primary flex items-center gap-1">
                                            ⏱ {exam.duration_minutes} Mins
                                        </span>
                                        <span className="text-secondary flex items-center gap-1">
                                            📋 {exam.questions?.length || 0} Questions
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => router.push(`/exam/${exam.id}`)}
                                    className="px-6 py-3 bg-primary text-slate-950 font-bold rounded-xl hover:opacity-90 hover:scale-[1.02] transition-all hover:shadow-[0_0_15px_rgba(192,193,255,0.3)] cursor-pointer text-center whitespace-nowrap self-start sm:self-auto w-full sm:w-auto"
                                >
                                    Start Exam
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}