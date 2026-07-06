'use client';
import { useEffect, useState } from 'react';
import { useRouter }           from 'next/navigation';
import { getExams }            from '@/lib/api';

export default function ExamListPage() {
    const router              = useRouter();
    const [exams, setExams]   = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const user = localStorage.getItem('user');
        if (!user) { router.push('/login'); return; }

        getExams()
            .then(res => setExams(res.data))
            .catch(() => router.push('/login'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <p className="text-gray-500">Loading exams...</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-3xl mx-auto">
                <h1 className="text-3xl font-bold text-indigo-700 mb-8">
                    Available Exams
                </h1>

                {exams.length === 0 ? (
                    <div className="bg-white rounded-xl p-8 text-center
                                    shadow-sm">
                        <p className="text-gray-500">
                            No active exams available.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {exams.map((exam: any) => (
                            <div key={exam.id}
                                 className="bg-white rounded-xl p-6 shadow-sm
                                            border border-gray-100 flex
                                            justify-between items-center">
                                <div>
                                    <h2 className="font-semibold text-gray-800
                                                   text-lg">
                                        {exam.title}
                                    </h2>
                                    <p className="text-gray-500 text-sm mt-1">
                                        Duration: {exam.duration_minutes} minutes
                                    </p>
                                </div>
                                <button
                                    onClick={() => router.push(`/exam/${exam.id}`)}
                                    className="px-6 py-2 bg-indigo-600 text-white
                                               rounded-lg font-medium
                                               hover:bg-indigo-700 transition">
                                    Start Exam
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}