// Agent text rendered as React text: links (http/https only) and **bold**, nothing else.
// Never built as HTML, so nothing the model writes can inject markup.
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent-foreground underline"
            >
              {part}
            </a>
          );
        }
        if (/^\*\*.+\*\*$/.test(part)) return <b key={i}>{part.slice(2, -2)}</b>;
        return part;
      })}
    </>
  );
}
