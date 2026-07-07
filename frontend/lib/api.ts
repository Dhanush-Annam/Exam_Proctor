import axios from 'axios';

const API = axios.create({
    baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
});

// Attach JWT token to every request
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export default API;

// ── Auth ─────────────────────────────────────────────────
export const register = (data: {
    name: string, email: string,
    password: string, role: string
}) => API.post('/api/auth/register', data);

export const login = (data: {
    email: string, password: string
}) => API.post('/api/auth/login', data);

// ── Exams ────────────────────────────────────────────────
export const getExams   = ()         => API.get('/api/exams');
export const getExam    = (id: string) => API.get(`/api/exams/${id}`);
export const createExam = (data: any) => API.post('/api/exams', data);
export const getExaminerExams = ()   => API.get('/api/exams/mine');
export const updateExamStatus = (id: string, status: string) =>
    API.patch(`/api/exams/${id}/status`, { status });
export const updateExam = (id: string, data: any) =>
    API.put(`/api/exams/${id}`, data);

// ── Proctor ──────────────────────────────────────────────
export const analyzeFrame = (formData: FormData) =>
    API.post('/api/proctor/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });

export const getFlags = (session_id: string) =>
    API.get(`/api/proctor/flags/${session_id}`);

export const getProctorSessions = () =>
    API.get('/api/proctor/sessions');

// ── Submissions ──────────────────────────────────────────
export const submitExam = (
    exam_id   : string,
    data      : { answers: Record<number, string>, session_id: string }
) => API.post(`/api/exams/${exam_id}/submit`, data);

export const getSubmissions = (exam_id: string) =>
    API.get(`/api/exams/${exam_id}/submissions`);