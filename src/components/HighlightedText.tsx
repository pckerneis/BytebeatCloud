/**
 * Renders text containing <mark>...</mark> markers into React elements with actual <mark> highlights.
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
