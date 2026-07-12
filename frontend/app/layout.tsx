import type { Metadata } from 'next';
import './globals.css';
import PrewarmBackend from '../components/PrewarmBackend';

export const metadata: Metadata = {
    title       : 'Exam Proctoring System',
    description : 'AI-powered online examination platform',
};

export default function RootLayout({
    children,
}: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="min-h-screen antialiased">
                <PrewarmBackend />
                {children}
            </body>
        </html>
    );
}