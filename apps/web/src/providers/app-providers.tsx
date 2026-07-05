"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@weather-app/ui/components/sonner";
import { useState } from "react";

import { ApiError } from "@/lib/api";

import { ThemeProvider } from "./theme-provider";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60 * 1000,
        retry: (failureCount, error) => {
          // 4xx responses (validation, not-found) are definitive — never retry.
          if (error instanceof ApiError && error.status < 500) {
            return false;
          }
          // Network errors / 5xx: retry a couple of times.
          return failureCount < 2;
        },
      },
    },
  });
}

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster richColors />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
