/**
 * Renders text containing <mark>...</mark> markers (as produced by PostgreSQL's ts_headline)
 * into React elements with actual <mark> highlights. All text parts are rendered safely
 * as text nodes — no dangerouslySetInnerHTML needed.
 */
export function HighlightedText({ text }: { text: string }) {
  const parts = text.split(/(<mark>.*?<\/mark>)/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('<mark>') && part.endsWith('</mark>') ? (
          <mark key={i}>{part.slice(6, -7)}</mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
