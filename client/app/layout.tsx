import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Job Importer - Admin',
    description: 'Import history tracking for job feeds',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
