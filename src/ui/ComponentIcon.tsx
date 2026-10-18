import type { LucideProps } from "lucide-react";
import { resolveComponentIcon } from "./resolveIcon";

export function ComponentIcon({
  type,
  orientation,
  size = 16,
  className,
  ...rest
}: {
  type: string;
  orientation?: unknown;
  size?: number;
  className?: string;
} & Omit<LucideProps, "size" | "ref" | "orientation">) {
  const Icon = resolveComponentIcon(type, { orientation });
  return (
    <Icon
      size={size}
      className={className}
      aria-hidden
      strokeWidth={1.75}
      {...rest}
    />
  );
}
