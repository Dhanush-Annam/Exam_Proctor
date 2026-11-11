'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, User, Mail, Lock, Key, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { register } from '@/lib/api';

export default function RegisterPage() {
    const router = useRouter();
    const [form, setForm] = useState({
        name: '', email: '', password: '', role: 'student', inviteCode: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await register(form);
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));

            if (res.data.user.role === 'examiner') {
                router.push('/dashboard');
            } else {
                router.push('/exam');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Registration failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-canvas text-primary-text flex flex-col justify-between items-center px-6 py-12">
            {/* Minimal Brand Nav */}
            <Link href="/" className="flex items-center gap-2.5 group">
                <div className="w-7 h-7 rounded-md bg-card border border-white/8 flex items-center justify-center text-accent">
                    <Shield className="w-4 h-4" strokeWidth={1.5} />
                </div>
                <span className="text-sm font-medium tracking-tight text-primary-text">
                    ExamProctor
                </span>
            </Link>

            {/* Auth Card */}
            <div className="w-full max-w-sm rounded-lg border border-white/8 bg-card p-8 shadow-card">
                <div className="mb-6">
                    <h1 className="text-xl font-medium tracking-tight text-primary-text">
                        Create account
                    </h1>
                    <p className="text-xs text-secondary-text mt-1">
                        Register for proctored candidate access or examiner portal
                    </p>
                </div>

                {error && (
                    <div className="mb-5 p-3 rounded-md bg-semantic-negative/10 border border-semantic-negative/30 text-semantic-negative text-xs flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.5} />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-secondary-text mb-1.5">
                            Full name
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-text">
                                <User className="w-4 h-4" strokeWidth={1.5} />
                            </div>
                            <input
                                type="text"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                className="w-full h-10 bg-canvas border border-white/8 focus:border-accent rounded-md pl-9 pr-3 text-sm text-primary-text placeholder:text-muted-text focus:outline-none transition-colors"
                                placeholder="Candidate or Examiner Name"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-secondary-text mb-1.5">
                            Email address
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-text">
                                <Mail className="w-4 h-4" strokeWidth={1.5} />
                            </div>
                            <input
                                type="email"
                                value={form.email}
                                onChange={e => setForm({ ...form, email: e.target.value })}
                                className="w-full h-10 bg-canvas border border-white/8 focus:border-accent rounded-md pl-9 pr-3 text-sm text-primary-text placeholder:text-muted-text focus:outline-none transition-colors"
                                placeholder="name@domain.edu"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-secondary-text mb-1.5">
                            Password
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-text">
                                <Lock className="w-4 h-4" strokeWidth={1.5} />
                            </div>
                            <input
                                type="password"
                                value={form.password}
                                onChange={e => setForm({ ...form, password: e.target.value })}
                                className="w-full h-10 bg-canvas border border-white/8 focus:border-accent rounded-md pl-9 pr-3 text-sm text-primary-text placeholder:text-muted-text focus:outline-none transition-colors"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-secondary-text mb-1.5">
                            Account role
                        </label>
                        <select
                            value={form.role}
                            onChange={e => setForm({ ...form, role: e.target.value })}
                            className="w-full h-10 bg-canvas border border-white/8 focus:border-accent rounded-md px-3 text-sm text-primary-text focus:outline-none transition-colors"
                        >
                            <option value="student">Student / Examinee</option>
                            <option value="examiner">Examiner / Proctor</option>
                        </select>
                    </div>

                    {form.role === 'examiner' && (
                        <div>
                            <label className="block text-xs font-medium text-secondary-text mb-1.5">
                                Examiner authorization code
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-text">
                                    <Key className="w-4 h-4" strokeWidth={1.5} />
                                </div>
                                <input
                                    type="text"
                                    value={form.inviteCode}
                                    onChange={e => setForm({ ...form, inviteCode: e.target.value })}
                                    className="w-full h-10 bg-canvas border border-white/8 focus:border-accent rounded-md pl-9 pr-3 text-xs font-mono text-primary-text placeholder:text-muted-text focus:outline-none transition-colors"
                                    placeholder="EXAM_PROCTOR_EXAMINER_2025"
                                    required
                                />
                            </div>
                            <div className="mt-2 p-2 rounded bg-canvas border border-white/8 flex items-center justify-between text-[11px] font-mono text-muted-text">
                                <span>Default: <code className="text-primary-text">EXAM_PROCTOR_EXAMINER_2025</code></span>
                                <button
                                    type="button"
                                    onClick={() => setForm({ ...form, inviteCode: 'EXAM_PROCTOR_EXAMINER_2025' })}
                                    className="text-[10px] text-accent hover:underline cursor-pointer"
                                >
                                    Autofill
                                </button>
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-10 mt-2 rounded-md bg-primary-text hover:bg-white text-canvas font-medium text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-canvas" strokeWidth={1.5} />
                        ) : (
                            <>
                                <span>Create account</span>
                                <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-6 pt-5 border-t border-white/8 text-center text-xs text-muted-text">
                    <span>Already registered? </span>
                    <Link href="/login" className="text-primary-text hover:underline font-medium">
                        Sign in
                    </Link>
                </div>
            </div>

            {/* Footer note */}
            <div className="text-[11px] font-mono text-muted-text">
                SYSTEM INTEGRITY PROTOCOL • FERPA VERIFIED
            </div>
        </div>
    );
}
