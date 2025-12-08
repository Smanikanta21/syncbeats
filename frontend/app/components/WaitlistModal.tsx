"use client"
import { User, Mail, UserPlus } from "lucide-react";
import React, { useState } from "react";
import { toast } from 'react-toastify';

type PropData = {
    setShowWaitlist: (show: boolean) => void;
};

export default function WaitlistModal({ setShowWaitlist }: PropData) {
    const [email, setEmail] = useState<string>("");
    const [name, setName] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false)
    const API_BASE = process.env.NEXT_PUBLIC_API_URL

    const handleWaitlist = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true)
            await new Promise(resolve => setTimeout(resolve, 1000));

            toast.success("You've been added to the waitlist!");
            setShowWaitlist(false);
        } catch {
            toast.error(`Error joining waitlist`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="glass-card p-8 rounded-2xl w-full border-[var(--accent)]/20 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-full h-20 bg-[var(--accent)]/10 blur-[50px] pointer-events-none"></div>
            <div className="text-center mb-8 relative z-10">
                <h1 className="text-3xl font-bold mb-2">Join the Waitlist</h1>
                <p className="text-[var(--text-secondary)] text-sm">Be the first to experience Room Spatial Audio.</p>
            </div>
            <form onSubmit={handleWaitlist} className="space-y-4 relative z-10">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--text-secondary)] ml-1" htmlFor="name">Full Name</label>
                    <div className="relative group">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--accent)] transition-colors">
                            <User size={18} />
                        </div>
                        <input type="text" id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" className="w-full pl-10 pr-4 py-3 bg-[var(--surface-2)] text-white rounded-xl border border-[var(--border-light)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none transition-all placeholder:text-[var(--text-muted)]" required/>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--text-secondary)] ml-1" htmlFor="email">Email Address</label>
                    <div className="relative group">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--accent)] transition-colors">
                            <Mail size={18} />
                        </div>
                        <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="w-full pl-10 pr-4 py-3 bg-[var(--surface-2)] text-white rounded-xl border border-[var(--border-light)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none transition-all placeholder:text-[var(--text-muted)]" required/>
                    </div>
                </div>

                <button type="submit" className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 group mt-6 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white transition-all shadow-[0_0_20px_var(--accent)]/20" disabled={loading}>
                    {loading ? (<span className="animate-pulse">Registering...</span>):(<>Join Waitlist <UserPlus size={18} className="group-hover:translate-x-1 transition-transform" /></>)}
                </button>
            </form>
        </div>
    );
}
