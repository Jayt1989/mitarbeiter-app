import { ImageResponse } from "next/og";

// Platzhalter-Icons; können später durch eigene Grafiken ersetzt werden.
const icons: Record<string, { size: number; maskable?: boolean }> = {
  "icon-32.png": { size: 32 },
  "apple-touch-icon.png": { size: 180 },
  "icon-192.png": { size: 192 },
  "icon-512.png": { size: 512 },
  "maskable-512.png": { size: 512, maskable: true },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(icons).map((name) => ({ name }));
}

export async function GET(_request: Request, { params }: RouteContext<"/icons/[name]">) {
  const { name } = await params;
  const icon = icons[name];
  if (!icon) return new Response("Not found", { status: 404 });

  const { size, maskable } = icon;
  // Maskable-Icons brauchen mehr Rand, da Android sie rund/oval beschneidet.
  const fontSize = Math.round(size * (maskable ? 0.3 : 0.4));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#174c37",
          color: "#ffffff",
          fontSize,
          fontWeight: 700,
          letterSpacing: -fontSize * 0.02,
        }}
      >
        MA
      </div>
    ),
    { width: size, height: size },
  );
}
