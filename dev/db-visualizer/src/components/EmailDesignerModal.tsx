"use client";

import { useState, useEffect } from "react";

interface UserItem {
  id: string;
  name: string;
  email: string;
}

interface EmailDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserItem[];
}

const TEMPLATE_PRESETS = [
  {
    id: "announcement",
    name: "Release Announcement",
    subject: "Introducing SyncBeats Streamlined Listening Experience",
    html: `<div style="font-family: Arial, sans-serif; background-color: #09090b; color: #f4f4f5; padding: 40px 20px; text-align: center;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #18181b; border-radius: 16px; border: 1px solid #27272a; padding: 32px; text-align: left;">
    <h1 style="color: #10b981; margin-top: 0;">SYNCBEATS</h1>
    <h2 style="color: #ffffff; font-size: 22px;">Hello {{name}}, exciting news!</h2>
    <p style="color: #a1a1aa; line-height: 1.6;">We have just deployed major performance improvements to room audio sync, device routing, and seamless playback across platforms.</p>
    
    <div style="background-color: #27272a; border-radius: 12px; padding: 16px; margin: 24px 0;">
      <h3 style="color: #34d399; margin: 0 0 8px 0;">What's New:</h3>
      <ul style="color: #d4d4d8; margin: 0; padding-left: 20px; line-height: 1.6;">
        <li>Sub-millisecond WebSocket audio synchronization</li>
        <li>Real-time active device switching</li>
        <li>Global room discovery & instant invites</li>
      </ul>
    </div>

    <a href="https://syncbeats.app/hub" style="display: inline-block; background-color: #10b981; color: #09090b; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 10px; margin-top: 12px;">Open SyncBeats App</a>
    
    <p style="color: #71717a; font-size: 12px; margin-top: 32px; border-t: 1px solid #27272a; padding-top: 16px;">Sent to {{email}} • © 2026 SyncBeats Inc.</p>
  </div>
</div>`,
  },
  {
    id: "welcome",
    name: "Welcome Email",
    subject: "Welcome to SyncBeats, {{name}}!",
    html: `<div style="font-family: Arial, sans-serif; background-color: #09090b; color: #f4f4f5; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #18181b; border-radius: 16px; border: 1px solid #27272a; padding: 32px;">
    <h1 style="color: #10b981;">Welcome to SyncBeats!</h1>
    <p style="color: #d4d4d8; font-size: 16px;">Hi <strong>{{name}}</strong>,</p>
    <p style="color: #a1a1aa; line-height: 1.6;">Thanks for joining SyncBeats! You can now create rooms, invite friends, and stream synchronized music seamlessly across all your devices.</p>
    
    <div style="margin: 28px 0;">
      <a href="https://syncbeats.app/hub" style="background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; text-decoration: none; font-weight: bold; padding: 14px 28px; border-radius: 12px; display: inline-block;">Start Listening Now</a>
    </div>

    <p style="color: #71717a; font-size: 12px; margin-top: 32px;">Questions? Reply to this email anytime.</p>
  </div>
</div>`,
  },
  {
    id: "security",
    name: "Account Notice",
    subject: "Security Notification for {{email}}",
    html: `<div style="font-family: Arial, sans-serif; background-color: #09090b; color: #f4f4f5; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #18181b; border-radius: 16px; border: 1px solid #27272a; padding: 32px;">
    <h2 style="color: #ef4444; margin-top: 0;">Account Security Update</h2>
    <p style="color: #d4d4d8;">Hello {{name}},</p>
    <p style="color: #a1a1aa; line-height: 1.6;">We noticed a new device sign-in on your SyncBeats account associated with {{email}} on {{created_at}}.</p>
    <p style="color: #a1a1aa; line-height: 1.6;">If this was you, no action is needed. If you did not recognize this device, please log out of all active devices immediately.</p>
    <div style="margin-top: 24px;">
      <a href="https://syncbeats.app/profile" style="background-color: #ef4444; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 10px; display: inline-block;">Manage Devices</a>
    </div>
  </div>
</div>`,
  },
  {
    id: "custom",
    name: "Blank Custom HTML",
    subject: "Update from SyncBeats",
    html: `<div style="font-family: sans-serif; padding: 20px; color: #333;">
  <h1>Hello {{name}},</h1>
  <p>Type or paste your custom HTML email template code here...</p>
</div>`,
  },
];

export default function EmailDesignerModal({ isOpen, onClose, users }: EmailDesignerModalProps) {
  const [userList, setUserList] = useState<UserItem[]>(users || []);
  const [subject, setSubject] = useState(TEMPLATE_PRESETS[0].subject);
  const [htmlCode, setHtmlCode] = useState(TEMPLATE_PRESETS[0].html);
  const [recipientMode, setRecipientMode] = useState<"all" | "active" | "custom" | "test">("test");
  const [testEmail, setTestEmail] = useState("abhinay@syncbeats.app");
  const [customEmailsInput, setCustomEmailsInput] = useState("");
  const [viewTab, setViewTab] = useState<"code" | "preview" | "split">("split");

  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      if (users && users.length > 0) {
        setUserList(users);
      } else {
        fetch("/api/data/User")
          .then((res) => res.json())
          .then((data) => {
            if (data.data) {
              setUserList(data.data);
            }
          })
          .catch((err) => console.error("[EmailModal] Failed to fetch users:", err));
      }
    }
  }, [isOpen, users]);

  if (!isOpen) return null;

  const insertVariable = (varName: string) => {
    setHtmlCode((prev) => prev + ` {{${varName}}}`);
  };

  const handleSelectPreset = (presetId: string) => {
    const preset = TEMPLATE_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setSubject(preset.subject);
      setHtmlCode(preset.html);
    }
  };

  const handleSend = async () => {
    if (!subject || !htmlCode) {
      alert("Subject and HTML Code cannot be empty");
      return;
    }

    setSending(true);
    setSendResult(null);

    const payload = {
      subject,
      htmlContent: htmlCode,
      recipientMode,
      testEmail,
      customEmails: customEmailsInput.split(",").map((e) => e.trim()),
    };

    try {
      const res = await fetch("/api/dashboard/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setSendResult(data);
      } else {
        alert(`Failed to send email: ${data.error || "Unknown error"}`);
      }
    } catch (e) {
      alert("Network error sending emails");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-xl p-4 overflow-y-auto">
      <div className="w-full max-w-6xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </span>
              HTML Email Code Designer
            </h2>
            <p className="text-xs text-zinc-400 mt-1">Paste custom HTML/CSS code with real-time live preview & variable substitution</p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              <button
                onClick={() => setViewTab("code")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewTab === "code" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                Code Only
              </button>
              <button
                onClick={() => setViewTab("split")}
                className={`hidden md:block px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewTab === "split" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                Split View
              </button>
              <button
                onClick={() => setViewTab("preview")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewTab === "preview" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                Live Preview
              </button>
            </div>

            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Toolbar & Target controls */}
        <div className="p-4 bg-zinc-950/40 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          {/* Preset Selector */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 font-medium">Preset:</span>
            <select
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              {TEMPLATE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Variable chips */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-medium mr-1">Variables:</span>
            <button
              onClick={() => insertVariable("name")}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-emerald-400 font-mono font-bold"
            >
              {"{{name}}"}
            </button>
            <button
              onClick={() => insertVariable("email")}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-emerald-400 font-mono font-bold"
            >
              {"{{email}}"}
            </button>
            <button
              onClick={() => insertVariable("created_at")}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-emerald-400 font-mono font-bold"
            >
              {"{{created_at}}"}
            </button>
          </div>

          {/* Recipient Selector */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 font-medium">Send To:</span>
            <select
              value={recipientMode}
              onChange={(e: any) => setRecipientMode(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              <option value="test">Send Test Email Only</option>
              <option value="active">Active Users (Last 7 days)</option>
              <option value="all">All Users ({userList.length})</option>
              <option value="custom">Custom Email List</option>
            </select>

            {recipientMode === "test" && (
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="myemail@domain.com"
                className="bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-1.5 font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
            )}

            {recipientMode === "custom" && (
              <input
                type="text"
                value={customEmailsInput}
                onChange={(e) => setCustomEmailsInput(e.target.value)}
                placeholder="email1@x.com, email2@y.com"
                className="bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-1.5 font-mono text-xs focus:outline-none focus:border-emerald-500 w-48"
              />
            )}
          </div>
        </div>

        {/* Subject Bar */}
        <div className="p-4 bg-zinc-950/80 border-b border-zinc-800">
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Subject Line</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email Subject Line"
            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-2 text-sm font-medium focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Editor & Preview Area */}
        <div className="flex-1 min-h-[380px] grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-800 overflow-hidden">
          {/* Code Editor */}
          {(viewTab === "code" || viewTab === "split") && (
            <div className={`flex flex-col h-full bg-zinc-950/90 ${viewTab === "code" ? "col-span-2" : ""}`}>
              <div className="p-2.5 bg-zinc-900/80 border-b border-zinc-800 text-xs font-mono text-zinc-400 flex items-center justify-between">
                <span>HTML Code Editor</span>
                <span className="text-[10px] text-zinc-500">{htmlCode.length} characters</span>
              </div>
              <textarea
                value={htmlCode}
                onChange={(e) => setHtmlCode(e.target.value)}
                placeholder="<h1>Type HTML code here...</h1>"
                className="flex-1 w-full p-4 bg-zinc-950 text-emerald-400 font-mono text-xs focus:outline-none resize-none leading-relaxed"
                spellCheck={false}
              />
            </div>
          )}

          {/* Sandboxed Live Preview */}
          {(viewTab === "preview" || viewTab === "split") && (
            <div className={`flex flex-col h-full bg-zinc-950 ${viewTab === "preview" ? "col-span-2" : ""}`}>
              <div className="p-2.5 bg-zinc-900/80 border-b border-zinc-800 text-xs font-mono text-zinc-400 flex items-center justify-between">
                <span>Live Sandboxed HTML Preview</span>
                <span className="text-[10px] text-emerald-400">Rendering Mode</span>
              </div>
              <div className="flex-1 w-full p-2 bg-zinc-950 overflow-auto">
                <iframe
                  srcDoc={htmlCode
                    .replace(/\{\{\s*name\s*\}\}/g, "John Doe")
                    .replace(/\{\{\s*email\s*\}\}/g, "johndoe@example.com")
                    .replace(/\{\{\s*created_at\s*\}\}/g, new Date().toLocaleDateString())}
                  sandbox="allow-same-origin"
                  title="Live Email Preview"
                  className="w-full h-full min-h-[350px] bg-white rounded-xl border border-zinc-800"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer actions & Send Result */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
          <div className="text-xs text-zinc-400">
            {sendResult && (
              <span className={`font-semibold ${sendResult.failCount === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                Dispatch complete: {sendResult.sentCount} sent, {sendResult.failCount} failed.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-zinc-950 rounded-xl text-xs font-extrabold shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {sending ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-zinc-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Dispatching...
                </>
              ) : (
                <>Send Email via Resend</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
