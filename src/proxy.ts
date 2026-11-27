import { NextResponse, type NextRequest } from "next/server";
import { isValidProductId } from "@/lib/products";

const SINGLE_PRODUCT_PATH_PATTERN = /^\/products\/([^/]+)$/;

/**
 * Pre-stream guard ensuring missing, malformed, or unknown /products/* paths return HTTP 404.
 */
export function proxy(request: NextRequest): NextResponse {
  const match = SINGLE_PRODUCT_PATH_PATTERN.exec(request.nextUrl.pathname);

  if (match) {
    try {
      const decodedId = decodeURIComponent(match[1]);
      if (isValidProductId(decodedId)) {
        return NextResponse.next();
      }
    } catch {
      // Malformed percent-encoding falls through to the static 404 rewrite below.
    }
  }

  return NextResponse.rewrite(new URL("/__not-found", request.url), {
    status: 404,
  });
}

export const config = {
  matcher: ["/products", "/products/:path*"],
};
