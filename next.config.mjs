/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @google/adk pulls in native/optional Cloud deps that should stay out of the
  // client + edge bundles and resolve only at runtime on the Node server.
  serverExternalPackages: ["@google/adk", "@google/genai"],
};

export default nextConfig;
