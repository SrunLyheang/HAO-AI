import { clerkMiddleware } from "@clerk/nextjs/server";

// No path-matching here — resource-based auth checks live on each protected
// page/route instead (app/page.tsx's auth()/redirectToSignIn(), and
// requireUser() in every API route). See ai-workflow-rules.md's route order
// and Clerk's createRouteMatcher deprecation notice.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
