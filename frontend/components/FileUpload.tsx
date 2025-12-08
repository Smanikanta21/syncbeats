import { useState } from 'react';
import { Upload, Cloud, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { authFetch } from '@/lib/authFetch';
import { motion } from 'framer-motion';

interface FileUploadProps {
    storageUsed: number;
    onUploadSuccess: (data: { url: string; name: string }) => void;
}

const MAX_STORAGE = 100 * 1024 * 1024;

export default function FileUpload({ storageUsed, onUploadSuccess }: FileUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);

    const handleFile = async (file: File) => {
        if (!file) return;

        if (file.size + storageUsed > MAX_STORAGE) {
            toast.error("Not enough storage space.");
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        setUploading(true);
        try {
            const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/upload`, {
                method: 'POST',
                body: formData,
                headers: {}
            });

            const data = await res.json();

            if (res.ok) {
                toast.success("File uploaded successfully");
                onUploadSuccess({ url: data.url, name: file.name });
            } else {
                toast.error(data.message || "Upload failed");
            }
        } catch (error) {
            console.error(error);
            toast.error("Upload error");
        } finally {
            setUploading(false);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const usedPercentage = Math.min((storageUsed / MAX_STORAGE) * 100, 100);
    const usedMB = (storageUsed / (1024 * 1024)).toFixed(2);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium flex items-center gap-2">
                    <Cloud size={16} className="text-[var(--sb-primary)]" /> Storage Usage
                </span>
                <span className="text-[var(--sb-text-muted)]">{usedMB} MB / 100 MB</span>
            </div>

            <div className="h-2 w-full bg-[var(--sb-surface-3)] rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${usedPercentage}%` }}
                    className={`h-full ${usedPercentage > 90 ? 'bg-red-500' : 'bg-[var(--sb-primary)]'}`}
                />
            </div>

            <div
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragActive
                    ? 'border-[var(--sb-primary)] bg-[var(--sb-primary)]/5'
                    : 'border-[var(--sb-border)] hover:border-[var(--sb-text-muted)]'
                    }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    onChange={handleChange}
                    disabled={uploading}
                />

                <label
                    htmlFor="file-upload"
                    className={`cursor-pointer flex flex-col items-center gap-2 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                >
                    <div className="p-3 rounded-full bg-[var(--sb-surface-2)] text-[var(--sb-text-main)] mb-2">
                        {uploading ? (
                            <div className="w-6 h-6 border-2 border-[var(--sb-primary)] border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Upload size={24} />
                        )}
                    </div>
                    <p className="font-medium text-[var(--sb-text-main)]">
                        {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                    </p>
                    <p className="text-xs text-[var(--sb-text-muted)]">
                        Any file up to 100MB total limit
                    </p>
                </label>
            </div>
        </div>
    );
}
