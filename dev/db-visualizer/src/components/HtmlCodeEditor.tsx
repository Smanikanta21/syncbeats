"use client";

import React, { useRef, useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

interface HtmlCodeEditorProps {
  code: string;
  onChange: (newCode: string) => void;
  className?: string;
}

/**
 * Format & Indent HTML/CSS strings into clean 2-space indented code
 */

export function formatHtmlCode(rawHtml: string): string {
  if (!rawHtml) return "";
  
  let formatted = "";
  let indentLevel = 0;
  const indentStr = "  ";

  // Normalize line breaks & collapse excess spacing outside quotes
  const sanitized = rawHtml
    .replace(/>\s*</g, "><")
    .replace(/[\r\n]+/g, "\n")
    .trim();

  // Tokens: tags, comments, text
  const tokens = sanitized.split(/(<!--[\s\S]*?-->|<[^>]+>)/g);

  const inlineTags = new Set(["span", "a", "b", "strong", "i", "em", "u", "font", "sub", "sup"]);
  const voidTags = new Set(["img", "br", "hr", "input", "meta", "link", "base", "col"]);

  for (let token of tokens) {
    if (!token) continue;

    if (token.startsWith("<!--")) {
      // Comment
      formatted += "\n" + indentStr.repeat(indentLevel) + token.trim();
    } else if (token.startsWith("</")) {
      // Closing tag
      const tagNameMatch = token.match(/^<\/\s*([a-zA-Z0-9-]+)/);
      const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : "";
      
      if (indentLevel > 0) indentLevel--;
      if (inlineTags.has(tagName)) {
        formatted += token;
      } else {
        formatted += "\n" + indentStr.repeat(indentLevel) + token;
      }
    } else if (token.startsWith("<")) {
      // Opening or self-closing tag
      const isSelfClosing = token.endsWith("/>");
      const tagNameMatch = token.match(/^<\s*([a-zA-Z0-9-]+)/);
      const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : "";

      if (token.toLowerCase().startsWith("<!doctype")) {
        formatted += token + "\n";
        continue;
      }

      if (inlineTags.has(tagName)) {
        formatted += token;
      } else {
        formatted += "\n" + indentStr.repeat(indentLevel) + token;
        if (!isSelfClosing && !voidTags.has(tagName) && !token.startsWith("<?")) {
          indentLevel++;
        }
      }
    } else {
      // Text node
      const textContent = token.trim();
      if (textContent) {
        formatted += textContent;
      }
    }
  }

  return formatted.trim();
}

/**
 * Lightweight Real-Time HTML & CSS Syntax Highlighter
 */
function highlightHtmlSyntax(htmlText: string): string {
  if (!htmlText) return "";

  // Escape HTML special chars first
  let escaped = htmlText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Highlight Comments
  escaped = escaped.replace(
    /(&lt;!--[\s\S]*?--&gt;)/g,
    '<span class="text-zinc-500 italic">$1</span>'
  );

  // Highlight HTML Tags & Attributes
  escaped = escaped.replace(
    /(&lt;\/?)([a-zA-Z0-9-]+)([^&]*?)(&gt;)/g,
    (_, open, tag, attrs, close) => {
      // Highlight attributes inside tag
      const highlightedAttrs = attrs.replace(
        /([a-zA-Z0-9-]+)=("[^"]*"|'[^']*'|[^\s&]+)/g,
        '<span class="text-amber-300">$1</span>=<span class="text-emerald-400">$2</span>'
      );
      return `<span class="text-blue-400 font-bold">${open}${tag}</span>${highlightedAttrs}<span class="text-blue-400 font-bold">${close}</span>`;
    }
  );

  // Highlight DOCTYPE
  escaped = escaped.replace(
    /(&lt;!DOCTYPE.*&gt;)/gi,
    '<span class="text-purple-400 font-bold">$1</span>'
  );

  return escaped;
}

export default function HtmlCodeEditor({ code, onChange, className }: HtmlCodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [highlightedCode, setHighlightedCode] = useState("");
  const [, startTransition] = useTransition();

  const lines = code.split("\n");
  const lineCount = lines.length;

  useEffect(() => {
    startTransition(() => {
      setHighlightedCode(highlightHtmlSyntax(code));
    });
  }, [code]);

  // Synchronize scrolling across textarea, pre layer, and line numbers gutter
  const handleScroll = () => {
    if (textareaRef.current) {
      const { scrollTop, scrollLeft } = textareaRef.current;
      if (preRef.current) {
        preRef.current.scrollTop = scrollTop;
        preRef.current.scrollLeft = scrollLeft;
      }
      if (gutterRef.current) {
        gutterRef.current.scrollTop = scrollTop;
      }
    }
  };

  // Intercept Tab & Enter keys for smart indentation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      const newCode = code.substring(0, start) + "  " + code.substring(end);
      onChange(newCode);

      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      // Calculate leading indent of current line
      const currentLine = code.substring(0, start).split("\n").pop() || "";
      const match = currentLine.match(/^\s*/);
      const indent = match ? match[0] : "";

      const insertText = "\n" + indent;
      const newCode = code.substring(0, start) + insertText + code.substring(end);
      onChange(newCode);

      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + insertText.length;
      }, 0);
    }
  };

  const handleFormat = () => {
    const formatted = formatHtmlCode(code);
    onChange(formatted);
  };

  return (
    <div className={cn("relative flex flex-col flex-1 w-full h-full min-h-0 bg-zinc-950 text-zinc-100 font-mono text-xs overflow-hidden", className)}>
      {/* Mini Action Toolbar: Format & Clean Code */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/90 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="font-bold text-zinc-300 text-[11px] tracking-wide uppercase">HTML/CSS Code IDE</span>
          <span className="text-[10px] text-zinc-500">({lineCount} lines, {code.length} chars)</span>
        </div>

        <button
          type="button"
          onClick={handleFormat}
          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-[11px] rounded-lg border border-zinc-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
          title="Auto-format HTML/CSS with clean 2-space indentations"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          <span>Auto-Format Code</span>
        </button>
      </div>

      {/* Editor Main Canvas with Line Numbers & Dual Layer Syntax Highlighting */}
      <div className="relative flex-1 flex w-full h-full min-h-0 overflow-hidden">
        {/* Line Numbers Gutter */}
        <div ref={gutterRef} className="w-12 bg-zinc-950/90 border-r border-zinc-800/80 py-3 pr-2 select-none text-right font-mono text-zinc-600 text-[11px] leading-relaxed shrink-0 overflow-hidden">
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Dual Layer Highlighting Editor */}
        <div className="relative flex-1 w-full h-full overflow-hidden">
          {/* Background Syntax Highlighted PRE Layer */}
          <pre
            ref={preRef}
            aria-hidden="true"
            className="absolute inset-0 p-3 m-0 font-mono text-xs leading-relaxed pointer-events-none whitespace-pre overflow-hidden tab-size-2 text-zinc-200"
            dangerouslySetInnerHTML={{ __html: highlightedCode + "\n" }}
          />

          {/* Foreground Transparent Textarea Input Layer */}
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            placeholder="<!DOCTYPE html><html><body><h1>Type HTML/CSS code...</h1></body></html>"
            className="absolute inset-0 p-3 m-0 w-full h-full font-mono text-xs leading-relaxed bg-transparent text-transparent caret-white focus:outline-none resize-none whitespace-pre overflow-auto tab-size-2 custom-scrollbar z-10"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
