"use client"
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, Mail, Shield, Bell, Moon, LogOut, Camera, ChevronRight, Laptop, Smartphone, Save, X, Trash2, Cloud, Pencil } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-toastify';
import { authFetch, clearAuthToken } from '@/lib/authFetch'
import { motion } from 'framer-motion';

import { useTheme } from '../context/ThemeContext';
import { Skeleton } from '@/components/ui/skeleton';
import FileUpload from '@/components/FileUpload';

interface Device {
    id: string;
    name: string;
    status: string;
    updatedAt: string;
    isCurrent?: boolean;
}

interface UserProfile {
    name: string;
    username: string;
    email: string;
    devices: Device[];
    storageUsed: number;
}

export default function ProfilePage() {
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const [user, setUser] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true);

    // New granular edit state
    const [activeSection, setActiveSection] = useState<'none' | 'details' | 'email' | 'password'>('none');

    // Form data for Details (Name/Username) and Email
    const [formData, setFormData] = useState({
        name: '',
        username: '',
        email: ''
    });

    // Separate state for password change
    const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '' });

    const url = process.env.NEXT_PUBLIC_API_URL

    useEffect(() => {
        if (user) {
            setFormData({
                name: user.name || '',
                username: user.username || '',
                email: user.email || ''
            });
        }
    }, [user]);

    const handleSave = async (section: 'details' | 'email') => {
        if (!user) return;
        try {
            const body = section === 'details'
                ? { name: formData.name, username: formData.username }
                : { email: formData.email };

            const res = await authFetch(`${url}/auth/profile`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                const data = await res.json();
                setUser({ ...user, ...data.user });
                setActiveSection('none');
                toast.success("Profile updated successfully");
            } else {
                toast.error("Failed to update profile");
            }
        } catch (error) {
            console.error('Update failed:', error);
            toast.error("Update failed");
        }
    };

    const handlePasswordChange = async () => {
        try {
            const res = await authFetch(`${url}/auth/change-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(passwordData)
            });

            const data = await res.json();
            if (res.ok) {
                toast.success("Password updated successfully");
                setActiveSection('none');
                setPasswordData({ oldPassword: '', newPassword: '' });
            } else {
                toast.error(data.message || "Failed to update password");
            }
        } catch (error) {
            console.error('Password update failed:', error);
            toast.error("Failed to update password");
        }
    };

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await authFetch(`${url}/auth/getprofiledata`, {
                    method: "GET"
                });

                if (res.ok) {
                    const data = await res.json();
                    setUser(data.user);
                } else {
                    router.push('/');
                }
            } catch (err) {
                console.error(err);
                toast.error("Failed to load profile");
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [router, url]);

    const handleLogout = async () => {
        try {
            await authFetch(`${url}/auth/logout`, {
                method: 'POST'
            });
            clearAuthToken();
            router.push('/');
            toast.success("Logged out successfully");
        } catch (error) {
            console.error('Logout failed:', error);
            toast.error("Logout failed");
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
    };

    const handleRemoveDevice = async (deviceId: string) => {
        if (!user) return;

        try {
            const deviceToRemove = user.devices.find((d: Device) => d.id === deviceId);

            const res = await authFetch(`${url}/auth/device/${deviceId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                if (deviceToRemove?.isCurrent) {
                    await handleLogout();
                    return;
                }

                const updatedDevices = user.devices.filter((d: Device) => d.id !== deviceId);
                setUser({ ...user, devices: updatedDevices });
                toast.success("Device removed successfully");
            } else {
                toast.error("Failed to remove device");
            }
        } catch (error) {
            console.error('Remove device failed:', error);
            toast.error("Failed to remove device");
        }
    };

    return (
        <div className="min-h-screen w-full bg-[var(--sb-bg)] text-[var(--sb-text-main)] font-sans selection:bg-[var(--sb-primary)] selection:text-white overflow-x-hidden relative">
            {/* Background Ambience */}
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[var(--sb-primary)] rounded-full blur-[120px] opacity-20 animate-pulse-glow pointer-events-none"></div>
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[var(--sb-secondary)] rounded-full blur-[120px] opacity-20 animate-pulse-glow pointer-events-none" style={{ animationDelay: '2s' }}></div>

            <div className="relative z-10 max-w-4xl mx-auto p-6 md:p-8">
                {/* Header */}
                <motion.header
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between mb-8"
                >
                    <Link href="/dashboard" className="flex items-center gap-2 text-[var(--sb-text-muted)] hover:text-[var(--sb-text-main)] transition-colors group">
                        <div className="p-2 rounded-full bg-[var(--sb-surface-1)] group-hover:bg-[var(--sb-surface-2)] transition-colors">
                            <ArrowLeft size={20} />
                        </div>
                        <span className="font-medium">Back to Dashboard</span>
                    </Link>
                    <h1 className="text-xl font-bold hidden md:block">My Profile</h1>
                    <div className="w-10"></div>
                </motion.header>

                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="space-y-6"
                >
                    {/* Profile Card */}
                    <motion.div variants={itemVariants} className="glass-card bg-[var(--sb-surface-1)] rounded-3xl p-8 border border-[var(--sb-border)] relative overflow-hidden">
                        <div className="relative flex flex-col md:flex-row items-center gap-6 mt-12">
                            <div className="relative">
                                <div className="w-32 h-32 rounded-full bg-[var(--sb-surface-2)] border-4 border-[var(--sb-bg)] flex items-center justify-center text-[var(--sb-text-muted)] shadow-xl">
                                    <User size={64} />
                                </div>
                                <button className="absolute bottom-0 right-0 p-2 rounded-full bg-[var(--sb-primary)] text-white shadow-lg hover:scale-110 transition-transform">
                                    <Camera size={16} />
                                </button>
                            </div>

                            <div className="text-center md:text-left flex-1 w-full relative">
                                {loading ? (
                                    <div className="space-y-3 w-full">
                                        <Skeleton className="h-10 w-48 bg-[var(--sb-surface-2)]" />
                                        <Skeleton className="h-5 w-32 bg-[var(--sb-surface-2)]" />
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {activeSection === 'details' ? (
                                            <div className="space-y-3 max-w-md animate-in fade-in slide-in-from-bottom-2">
                                                <input
                                                    type="text"
                                                    value={formData.name}
                                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                    className="w-full bg-[var(--sb-surface-2)] border border-[var(--sb-border)] rounded-xl px-4 py-2 text-[var(--sb-text-main)] focus:border-[var(--sb-primary)] focus:outline-none"
                                                    placeholder="Full Name"
                                                    autoFocus
                                                />
                                                <input
                                                    type="text"
                                                    value={formData.username}
                                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                                    className="w-full bg-[var(--sb-surface-2)] border border-[var(--sb-border)] rounded-xl px-4 py-2 text-[var(--sb-text-main)] focus:border-[var(--sb-primary)] focus:outline-none"
                                                    placeholder="Username"
                                                />
                                                <div className="flex gap-2 justify-center md:justify-start pt-2">
                                                    <button onClick={() => setActiveSection('none')} className="px-4 py-2 rounded-xl bg-[var(--sb-surface-2)] text-[var(--sb-text-muted)] hover:text-[var(--sb-text-main)] font-medium flex items-center gap-2"><X size={16} /> Cancel</button>
                                                    <button onClick={() => handleSave('details')} className="btn-primary px-6 py-2 rounded-xl font-medium flex items-center gap-2"><Save size={16} /> Save</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <h2 className="text-3xl font-bold mb-1">{user?.name}</h2>
                                                <p className="text-[var(--sb-text-muted)]">@{user?.username}</p>
                                            </>
                                        )}
                                    </div>
                                )}
                                {activeSection !== 'details' && <p className="text-[var(--sb-text-muted)] mb-4 mt-2">Music Enthusiast • Free Plan</p>}

                                {activeSection !== 'details' && (
                                    <div className="absolute top-0 right-0">
                                        <button onClick={() => setActiveSection('details')} className="p-2 text-[var(--sb-text-muted)] hover:text-[var(--sb-text-main)] hover:bg-[var(--sb-surface-2)] rounded-lg transition-colors" title="Edit Profile Details">
                                            <Pencil size={18} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>

                    {/* Settings Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Account Settings */}
                        <motion.div variants={itemVariants} className="glass-card bg-[var(--sb-surface-1)] rounded-3xl p-6 border border-[var(--sb-border)]">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <Shield size={20} className="text-[var(--sb-primary)]" /> Account
                            </h3>
                            <div className="space-y-1">
                                {/* Email Logic */}
                                <div className={`p-4 rounded-xl transition-all ${activeSection === 'email' ? 'bg-[var(--sb-surface-2)] border border-[var(--sb-primary)]/50' : 'hover:bg-[var(--sb-surface-2)]'}`}>
                                    {activeSection === 'email' ? (
                                        <div className="space-y-3 animate-in fade-in zoom-in-95">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-2 rounded-lg bg-[var(--sb-surface-3)] text-[var(--sb-text-main)]"><Mail size={18} /></div>
                                                <p className="font-medium">Edit Email</p>
                                            </div>
                                            <input
                                                type="email"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                className="w-full bg-[var(--sb-surface-3)] border border-[var(--sb-border)] rounded-lg px-3 py-2 text-sm text-[var(--sb-text-main)] focus:border-[var(--sb-primary)] focus:outline-none"
                                                autoFocus
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => setActiveSection('none')} className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-[var(--sb-surface-3)]">Cancel</button>
                                                <button onClick={() => handleSave('email')} className="px-3 py-1.5 text-xs font-medium bg-[var(--sb-primary)] text-white rounded-lg hover:bg-[var(--sb-primary)]/90">Save</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={() => setActiveSection('email')} className="w-full flex items-center justify-between group">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-[var(--sb-surface-2)] text-[var(--sb-text-muted)] group-hover:text-[var(--sb-text-main)] transition-colors">
                                                    <Mail size={18} />
                                                </div>
                                                <div className="text-left">
                                                    <p className="font-medium">Email Address</p>
                                                    <p className="text-xs text-[var(--sb-text-muted)]">{user?.email}</p>
                                                </div>
                                            </div>
                                            <Pencil size={14} className="text-[var(--sb-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                    )}
                                </div>

                                {/* Password Logic */}
                                <div className={`p-4 rounded-xl transition-all ${activeSection === 'password' ? 'bg-[var(--sb-surface-2)] border border-[var(--sb-primary)]/50' : 'hover:bg-[var(--sb-surface-2)]'}`}>
                                    {activeSection === 'password' ? (
                                        <div className="space-y-3 animate-in fade-in zoom-in-95">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-2 rounded-lg bg-[var(--sb-surface-3)] text-[var(--sb-text-main)]"><Shield size={18} /></div>
                                                <p className="font-medium">Change Password</p>
                                            </div>
                                            <input
                                                type="password"
                                                placeholder="Old Password"
                                                value={passwordData.oldPassword}
                                                onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                                                className="w-full bg-[var(--sb-surface-3)] border border-[var(--sb-border)] rounded-lg px-3 py-2 text-sm text-[var(--sb-text-main)] focus:border-[var(--sb-primary)] focus:outline-none"
                                                autoFocus
                                            />
                                            <input
                                                type="password"
                                                placeholder="New Password"
                                                value={passwordData.newPassword}
                                                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                                className="w-full bg-[var(--sb-surface-3)] border border-[var(--sb-border)] rounded-lg px-3 py-2 text-sm text-[var(--sb-text-main)] focus:border-[var(--sb-primary)] focus:outline-none"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => { setActiveSection('none'); setPasswordData({ oldPassword: '', newPassword: '' }); }} className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-[var(--sb-surface-3)]">Cancel</button>
                                                <button onClick={handlePasswordChange} className="px-3 py-1.5 text-xs font-medium bg-[var(--sb-primary)] text-white rounded-lg hover:bg-[var(--sb-primary)]/90">Update</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={() => setActiveSection('password')} className="w-full flex items-center justify-between group">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-[var(--sb-surface-2)] text-[var(--sb-text-muted)] group-hover:text-[var(--sb-text-main)] transition-colors">
                                                    <Shield size={18} />
                                                </div>
                                                <div className="text-left">
                                                    <p className="font-medium">Password & Security</p>
                                                    <p className="text-xs text-[var(--sb-text-muted)]">Tap to change password</p>
                                                </div>
                                            </div>
                                            <ChevronRight size={16} className="text-[var(--sb-text-muted)]" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>

                        {/* Preferences */}
                        <motion.div variants={itemVariants} className="glass-card bg-[var(--sb-surface-1)] rounded-3xl p-6 border border-[var(--sb-border)]">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <Bell size={20} className="text-[var(--sb-secondary)]" /> Preferences
                            </h3>
                            <div className="space-y-1">
                                <button className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-[var(--sb-surface-2)] transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-[var(--sb-surface-2)] text-[var(--sb-text-muted)] group-hover:text-[var(--sb-text-main)] transition-colors">
                                            <Bell size={18} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-medium">Notifications</p>
                                            <p className="text-xs text-[var(--sb-text-muted)]">On</p>
                                        </div>
                                    </div>
                                    <div className="w-10 h-6 bg-[var(--sb-primary)] rounded-full relative">
                                        <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
                                    </div>
                                </button>
                                <button
                                    onClick={toggleTheme}
                                    className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-[var(--sb-surface-2)] transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-[var(--sb-surface-2)] text-[var(--sb-text-muted)] group-hover:text-[var(--sb-text-main)] transition-colors">
                                            <Moon size={18} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-medium">Appearance</p>
                                            <p className="text-xs text-[var(--sb-text-muted)]">
                                                {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className={`w-10 h-6 rounded-full relative transition-colors ${theme === 'dark' ? 'bg-[var(--sb-surface-3)]' : 'bg-[var(--sb-primary)]'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${theme === 'dark' ? 'left-1' : 'right-1'}`}></div>
                                    </div>
                                </button>
                            </div>
                        </motion.div>
                    </div>

                    {/* Devices Section */}
                    <motion.div variants={itemVariants} className="glass-card bg-[var(--sb-surface-1)] rounded-3xl p-6 border border-[var(--sb-border)]">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Laptop size={20} className="text-[var(--sb-primary)]" /> Logged-in Devices
                        </h3>
                        <div className="space-y-3">
                            {loading ? (
                                <>
                                    <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--sb-surface-2)] border border-[var(--sb-border)]">
                                        <div className="flex items-center gap-4">
                                            <Skeleton className="w-10 h-10 rounded-full bg-[var(--sb-surface-3)]" />
                                            <div className="space-y-2">
                                                <Skeleton className="h-4 w-32 bg-[var(--sb-surface-3)]" />
                                                <Skeleton className="h-3 w-24 bg-[var(--sb-surface-3)]" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--sb-surface-2)] border border-[var(--sb-border)]">
                                        <div className="flex items-center gap-4">
                                            <Skeleton className="w-10 h-10 rounded-full bg-[var(--sb-surface-3)]" />
                                            <div className="space-y-2">
                                                <Skeleton className="h-4 w-32 bg-[var(--sb-surface-3)]" />
                                                <Skeleton className="h-3 w-24 bg-[var(--sb-surface-3)]" />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {user?.devices?.map((device: Device) => (
                                        <div key={device.id} className="flex items-center justify-between p-4 rounded-xl bg-[var(--sb-surface-2)] border border-[var(--sb-border)]">
                                            <div className="flex items-center gap-4">
                                                <div className={`p-3 rounded-full ${device.status === 'online' ? 'bg-[var(--sb-success)]/10 text-[var(--sb-success)]' : 'bg-[var(--sb-text-muted)]/10 text-[var(--sb-text-muted)]'}`}>
                                                    {device.name.toLowerCase().includes('mobile') || device.name.toLowerCase().includes('phone') ?
                                                        <Smartphone size={20} /> : <Laptop size={20} />
                                                    }
                                                </div>
                                                <div>
                                                    <p className="font-medium text-[var(--sb-text-main)] flex items-center gap-2">
                                                        {device.name}
                                                        {device.isCurrent && (
                                                            <span className="px-2 py-0.5 rounded-full bg-[var(--sb-primary)]/10 border border-[var(--sb-primary)]/30 text-[10px] font-bold text-[var(--sb-primary)] uppercase tracking-wider">
                                                                This Device
                                                            </span>
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-[var(--sb-text-muted)]">
                                                        Last active: {new Date(device.updatedAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${device.status === 'online' ? 'bg-[var(--sb-success)] animate-pulse' : 'bg-[var(--sb-text-muted)]'}`}></span>
                                                    <span className="text-xs font-medium text-[var(--sb-text-muted)] capitalize">{device.status}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveDevice(device.id)}
                                                    className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                                    title="Remove Device"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {(!user?.devices || user.devices.length === 0) && (
                                        <p className="text-[var(--sb-text-muted)] text-center py-4">No devices found.</p>
                                    )}
                                </>
                            )}
                        </div>
                    </motion.div>

                    {/* Danger Zone */}
                    <motion.div variants={itemVariants} className="glass-card bg-[var(--sb-surface-1)] rounded-3xl p-6 border border-red-500/20">
                        <h3 className="text-lg font-bold mb-4 text-red-400">Danger Zone</h3>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-[var(--sb-text-main)]">Sign Out</p>
                                <p className="text-sm text-[var(--sb-text-muted)]">Securely log out of your account on this device</p>
                            </div>


                            <button
                                onClick={handleLogout}
                                className="px-6 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors font-medium flex items-center gap-2"
                            >
                                <LogOut size={18} /> Log Out
                            </button>
                        </div>
                    </motion.div>

                    {/* Cloud Storage Section */}
                    {user && (
                        <motion.div variants={itemVariants} className="glass-card bg-[var(--sb-surface-1)] rounded-3xl p-6 border border-[var(--sb-border)]">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <Cloud size={20} className="text-[var(--sb-primary)]" /> Cloud Storage
                            </h3>
                            <div className="p-4 rounded-xl bg-[var(--sb-surface-2)] border border-[var(--sb-border)]">
                                <FileUpload
                                    storageUsed={user.storageUsed || 0}
                                    onUploadSuccess={() => {
                                        // Trigger a re-fetch of the profile to update storage usage
                                        const fetchProfile = async () => {
                                            try {
                                                const res = await authFetch(`${url}/auth/getprofiledata`, {
                                                    method: "GET"
                                                });
                                                if (res.ok) {
                                                    const data = await res.json();
                                                    setUser(data.user);
                                                }
                                            } catch (err) {
                                                console.error(err);
                                            }
                                        };
                                        fetchProfile();
                                    }}
                                />
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
