import type { Metadata } from 'next';
import './globals.css';

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
                {children}
            </body>
        </html>
    );
}