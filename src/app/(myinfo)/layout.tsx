export default function MyInfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-white">{children}</body>
    </html>
  );
}
