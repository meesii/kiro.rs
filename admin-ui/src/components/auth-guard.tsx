import { Navigate } from "react-router"
import { storage } from "@/lib/storage"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const key = storage.get_api_key()
  if (!key) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
