"use client";

import { Button } from "@weather-app/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@weather-app/ui/components/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@weather-app/ui/components/drawer";
import { useIsMobile } from "@weather-app/ui/hooks/use-mobile";
import { useRouter } from "next/navigation";
import { useState } from "react";

import SignInForm from "./sign-in-form";
import SignUpForm from "./sign-up-form";

type AuthMode = "sign-in" | "sign-up";

const COPY: Record<AuthMode, { title: string; description: string; switchLabel: string }> = {
  "sign-in": {
    title: "Sign in",
    description: "Sign in to keep favourites and search history.",
    switchLabel: "Need an account? Sign up",
  },
  "sign-up": {
    title: "Create account",
    description: "Create an account to keep favourites and search history.",
    switchLabel: "Already have an account? Sign in",
  },
};

export interface AuthDrawerProps {
  /** The element that opens the drawer (rendered via Base UI's `render`). */
  trigger: React.ReactElement;
}

/**
 * Sign-in/sign-up in a responsive overlay: a centred Dialog on desktop, a
 * bottom Drawer on mobile (the shadcn responsive-drawer pattern). Owns the
 * open state and the mode toggle; a successful sign-in/up closes it and the
 * session refresh flips the rest of the UI to signed-in — no navigation.
 */
export function AuthDrawer({ trigger }: AuthDrawerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const isMobile = useIsMobile();
  const router = useRouter();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Reset so reopening always starts on sign-in.
      setMode("sign-in");
    }
  }

  const handleSuccess = () => {
    handleOpenChange(false);
    // Favourites are server-rendered: refresh the RSC tree so the new
    // session's data appears without a navigation.
    router.refresh();
  };
  const copy = COPY[mode];
  const form =
    mode === "sign-in" ? (
      <SignInForm onSuccess={handleSuccess} />
    ) : (
      <SignUpForm onSuccess={handleSuccess} />
    );
  const switchButton = (
    <Button
      type="button"
      variant="link"
      onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
    >
      {copy.switchLabel}
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger render={trigger} />
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{copy.title}</DrawerTitle>
            <DrawerDescription>{copy.description}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4">{form}</div>
          <DrawerFooter>{switchButton}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {form}
        <DialogFooter className="sm:justify-center">{switchButton}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
