export { auth as proxy } from "./auth";

export const config = {
  matcher: [
    "/admin/:path*",
    "/mitarbeiter/:path*",
    "/schichtplan/:path*",
    "/urlaub/:path*",
    "/export/:path*",
  ],
};
