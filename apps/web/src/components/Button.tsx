import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base = "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<Variant, string> = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
  };

  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
