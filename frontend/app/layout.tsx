import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import PrewarmBackend from '../components/PrewarmBackend';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

export const metadata: Metadata = {
    title: 'ExamProctor — Automated Examination Integrity',
    description: 'Continuous browser, webcam, and gaze integrity monitoring for online exams.',
};

export default function RootLayout({
    children,
}: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
            <body className="min-h-screen bg-canvas text-primary-text antialiased">
                <PrewarmBackend />
                {children}
            </body>
        </html>
    );
}
