'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, User, LogOut } from 'lucide-react';

interface NavbarProps {
    readonly showTelemetry?: boolean;
}

export default function Navbar({ showTelemetry = false }: NavbarProps) {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null);

    useEffect(() => {
        try {
            const stored = localStorage.getItem('user');
            if (stored) {
                setUser(JSON.parse(stored));
            }
        } catch {
            // ignore JSON parse error
        }
    }, []);

    const handleSignOut = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        router.push('/login');
    };

    return (
        <header className="h-14 w-full border-b border-white/8 bg-deep px-6 flex items-center justify-between z-30 shrink-0">
            <div className="flex items-center gap-6">
                <Link href="/" className="flex items-center gap-2.5 group">
                    <div className="w-7 h-7 rounded-md bg-raised border border-white/8 flex items-center justify-center text-primary-text group-hover:border-white/20 transition-colors">
                        <Shield className="w-4 h-4 text-accent" strokeWidth={1.5} />
                    </div>
                    <span className="text-sm font-medium tracking-tight text-primary-text">
                        ExamProctor
                    </span>
                </Link>

                {showTelemetry && (
                    <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-muted-text border-l border-white/8 pl-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-semantic-positive"></span>
                        <span className="tabular-nums">42ms</span>
                        <span>•</span>
                        <span className="text-[11px] uppercase tracking-wider">Live telemetry</span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3">
                {user ? (
                    <div className="flex items-center gap-3">
                        <Link
                            href={user.role === 'examiner' ? '/dashboard' : '/exam'}
                            className="hidden sm:flex items-center gap-2 text-xs font-medium text-secondary-text hover:text-primary-text px-3 py-1.5 rounded-md hover:bg-card transition-colors"
                        >
                            <User className="w-3.5 h-3.5" strokeWidth={1.5} />
                            <span>{user.name}</span>
                            <span className="text-[10px] font-mono text-muted-text bg-raised px-1.5 py-0.5 rounded">
                                {user.role}
                            </span>
                        </Link>
                        <button
                            type="button"
                            onClick={handleSignOut}
                            className="flex items-center gap-1.5 text-xs text-muted-text hover:text-primary-text px-3 py-1.5 rounded-md border border-white/8 bg-card hover:bg-raised transition-colors cursor-pointer"
                        >
                            <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
                            <span>Sign out</span>
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <Link
                            href="/login"
                            className="text-xs font-medium text-secondary-text hover:text-primary-text px-3 py-1.5 rounded-md transition-colors"
                        >
                            Sign in
                        </Link>
                        <Link
                            href="/register"
                            className="text-xs font-medium bg-primary-text text-canvas hover:bg-white px-3.5 py-1.5 rounded-md transition-colors"
                        >
                            Register
                        </Link>
                    </div>
                )}
            </div>
        </header>
    );
}
