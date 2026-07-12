'use client';

import { useEffect } from 'react';

export default function PrewarmBackend() {
    useEffect(() => {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
        
        console.log('Prewarming backend at:', backendUrl);
        fetch(`${backendUrl}/api/prewarm`)
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .then((data) => console.log('Backend prewarmed successfully:', data))
            .catch((err) => console.warn('Backend prewarm ping failed (could be offline or starting up):', err));
    }, []);

    return null;
}
