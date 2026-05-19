import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * UI 工具函数
 */
export const fmt = {
  cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
  },
}

export const { cn } = fmt
