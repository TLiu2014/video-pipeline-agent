import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

const DESCRIPTION =
  "CineDAG — describe a video workflow in plain English and a Gemini-powered multi-agent pipeline builds and runs it: AI dubbing, bilingual subtitle burning, social-media aspect-ratio crops and more.";

export const metadata: Metadata = {
  title: "CineDAG — Build & run multimodal video pipelines",
  description: DESCRIPTION,
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "CineDAG — Build & run multimodal video pipelines",
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/brand-16x9.png", width: 1920, height: 1080 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CineDAG",
    description: DESCRIPTION,
    images: ["/brand-16x9.png"],
  },
};

// Applied before hydration so a stored dark theme doesn't flash light first.
const noFlashScript = `try{if(localStorage.getItem('video-agent:theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
