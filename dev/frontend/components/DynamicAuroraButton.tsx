"use client";

import { motion } from "framer-motion";
import Link from "next/link";

/**
 * The site's primary call to action.
 *
 * Still a motion component — the hover lift and press scale are the behaviour
 * other pages rely on — but the chrome is now solid ink rather than a glowing
 * glass pill. On a page full of translucent panels, an opaque button is what
 * reads as "this is the action"; a tinted glow reads as decoration, and with no
 * brand hue left there is nothing for it to glow in.
 */

const MotionLink = motion.create(Link);

interface DynamicAuroraButtonProps {
  children: React.ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

const MOTION = {
  whileHover: { y: -1 },
  whileTap: { y: 0, scale: 0.98 },
};

const CLASSES =
  "rounded-full bg-foreground text-background font-semibold inline-flex items-center justify-center " +
  "transition-colors whitespace-nowrap active:opacity-90 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export function DynamicAuroraButton({
  children,
  className = "",
  href,
  onClick,
  type = "button",
  disabled = false,
}: DynamicAuroraButtonProps) {
  if (href) {
    return (
      <MotionLink href={href} onClick={onClick} {...MOTION} className={`${CLASSES} ${className}`}>
        {children}
      </MotionLink>
    );
  }

  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : MOTION.whileHover}
      whileTap={disabled ? undefined : MOTION.whileTap}
      className={`${CLASSES} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      {children}
    </motion.button>
  );
}
