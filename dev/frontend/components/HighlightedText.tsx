export function HighlightedText({ text, query = "" }: { text: string; query?: string }) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return <>{text}</>;
  const lower = text.toLocaleLowerCase();
  const parts = [];
  let offset = 0;
  let match = lower.indexOf(needle);
  while (match !== -1) {
    parts.push(text.slice(offset, match));
    parts.push(<mark key={match} className="rounded-sm bg-foreground/15 text-foreground">{text.slice(match, match + needle.length)}</mark>);
    offset = match + needle.length;
    match = lower.indexOf(needle, offset);
  }
  parts.push(text.slice(offset));
  return <>{parts}</>;
}
