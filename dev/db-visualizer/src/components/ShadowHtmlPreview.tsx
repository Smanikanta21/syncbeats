"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ShadowHtmlPreviewProps {
  html: string;
  className?: string;
}

export default function ShadowHtmlPreview({ html, className }: ShadowHtmlPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    if (containerRef.current && !shadowRootRef.current) {
      // Attach open shadow DOM for style isolation
      shadowRootRef.current = containerRef.current.attachShadow({ mode: "open" });
    }
  }, []);

  useEffect(() => {
    if (shadowRootRef.current) {
      const processedHtml = html
        .replace(/\{\{\s*name\s*\}\}/g, "John Doe")
        .replace(/\{\{\s*email\s*\}\}/g, "johndoe@example.com")
        .replace(/\{\{\s*created_at\s*\}\}/g, new Date().toLocaleDateString());

      // Inject custom styling for shadow root content container
      const styledContent = `
        <style>
          :host {
            display: block;
            width: 100%;
            height: auto;
            min-height: 100%;
            background-color: #050507;
            color: #fafafa;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            box-sizing: border-box;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            padding: 0;
            background-color: #050507;
            color: #fafafa;
          }
        </style>
        <div className="shadow-email-wrapper">
          ${processedHtml}
        </div>
      `;

      shadowRootRef.current.innerHTML = styledContent;
    }
  }, [html]);

  return (
    <div className={cn("flex-1 w-full h-full min-h-0 bg-zinc-950 overflow-y-auto custom-scrollbar p-3", className)}>
      <div className="w-full h-auto rounded-2xl border border-zinc-800 bg-[#050507] p-2 shadow-2xl">
        <div ref={containerRef} className="w-full h-auto" />
      </div>
    </div>
  );
}
