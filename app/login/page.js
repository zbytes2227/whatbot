'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { saveAuthSession, authFetch } from '@/lib/clientApi';
import 'react-toastify/dist/ReactToastify.css';

export default function LoginPage() {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    // Check if session is already active
    async function verifyExistingSession() {
      try {
        const res = await authFetch('/api/auth');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.valid) {
            router.replace('/');
          }
        }
      } catch {}
    }
    verifyExistingSession();
  }, [router]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username || !formData.password) {
      toast.error('Please fill in all fields');
      return;
    }
    setIsLoading(true);
    try {
      const response = await axios.post('/api/login', formData, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.data.success) {
        toast.success('Signed in successfully');
        saveAuthSession(response.data.token, response.data.user);
        setTimeout(() => router.push('/'), 600);
      }
    } catch (error) {
      toast.error(error.response?.data?.msg || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-root">
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar
        closeOnClick
        theme="light"
      />

      <div className={`login-card ${mounted ? 'login-card--visible' : ''}`}>
        <div className="login-mark">
          <Image src="/logo.png" alt="WhatBot" width={64} height={64} className="login-mark__icon object-cover" priority />
        </div>

        <h1 className="login-title">Sign in</h1>
        <p className="login-sub">Access your admin dashboard</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <label htmlFor="username" className="field__label">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="Username (e.g. Paradox)"
              value={formData.username}
              onChange={handleInputChange}
              disabled={isLoading}
              required
              className="field__input"
            />
          </div>

          <div className="field">
            <label htmlFor="password" className="field__label">Password</label>
            <div className="field__password-wrap">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleInputChange}
                disabled={isLoading}
                required
                className="field__input field__input--password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                disabled={isLoading}
                className="field__reveal"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary btn-primary--full"
          >
            {isLoading ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <LogIn size={15} />
            )}
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login-footer-note">
          All activity is logged and monitored.
        </p>
      </div>


      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          background: #f9fafb;
          font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
        }

        .login-card {
          width: 100%;
          max-width: 380px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 2.5rem 2rem;
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.35s ease, transform 0.35s ease;
        }
        .login-card--visible { opacity: 1; transform: translateY(0); }

        .login-mark {
          width: 40px; height: 40px;
          border-radius: 10px;
          background: #16a34a;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 1.5rem;
        }
        .login-mark__icon {
          color: #fff;
          font-size: 18px;
          font-weight: 700;
          line-height: 1;
          letter-spacing: -0.5px;
        }

        .login-title {
          font-size: 22px;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.4px;
        }
        .login-sub {
          margin-top: 4px;
          font-size: 14px;
          color: #6b7280;
        }

        .login-form {
          margin-top: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .field { display: flex; flex-direction: column; gap: 6px; }
        .field__label {
          font-size: 13px;
          font-weight: 500;
          color: #374151;
        }
        .field__input {
          width: 100%;
          height: 40px;
          padding: 0 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          color: #111827;
          background: #fff;
          outline: none;
          transition: border-color 0.15s;
        }
        .field__input:focus { border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,0.1); }
        .field__input::placeholder { color: #9ca3af; }
        .field__input:disabled { background: #f9fafb; opacity: 0.7; cursor: not-allowed; }

        .field__password-wrap { position: relative; }
        .field__input--password { padding-right: 40px; }
        .field__reveal {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #9ca3af; display: flex; align-items: center;
          padding: 4px; border-radius: 4px;
          transition: color 0.15s;
        }
        .field__reveal:hover { color: #374151; }

        .btn-primary {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          height: 40px; padding: 0 16px;
          border-radius: 8px; border: none; cursor: pointer;
          font-size: 14px; font-weight: 500;
          background: #111827; color: #fff;
          transition: background 0.15s, opacity 0.15s;
        }
        .btn-primary:hover:not(:disabled) { background: #1f2937; }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-primary--full { width: 100%; margin-top: 0.25rem; }

        .spinner {
          display: inline-block;
          width: 15px; height: 15px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .login-footer-note {
          margin-top: 1.75rem;
          font-size: 12px;
          color: #9ca3af;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
