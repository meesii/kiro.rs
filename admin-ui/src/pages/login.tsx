import { useState } from "react"
import { useNavigate } from "react-router"
import { ShieldCheck, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { storage } from "@/lib/storage"
import { toast } from "sonner"

export function LoginPage() {
  const [key, set_key] = useState("")
  const [show_key, set_show_key] = useState(false)
  const [loading, set_loading] = useState(false)
  const navigate = useNavigate()

  const handle_login = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!key.trim()) return
    set_loading(true)
    try {
      storage.set_api_key(key.trim())
      const res = await fetch("/api/admin/credentials", {
        headers: { "x-api-key": key.trim() },
      })
      if (res.ok) {
        toast.success("认证成功")
        navigate("/", { replace: true })
      } else {
        storage.remove_api_key()
        toast.error("API 密钥无效")
      }
    } catch {
      storage.remove_api_key()
      toast.error("连接失败")
    } finally {
      set_loading(false)
    }
  }

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-4 flex size-14 items-center justify-center rounded-xl">
            <ShieldCheck className="size-7" />
          </div>
          <CardTitle className="text-2xl">Kiro 管理面板</CardTitle>
          <CardDescription>请输入管理员 API 密钥以继续</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handle_login} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API 密钥</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={show_key ? "text" : "password"}
                  placeholder="请输入管理员 API 密钥"
                  value={key}
                  onChange={(e) => set_key(e.target.value)}
                  className="pr-10"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                  onClick={() => set_show_key(!show_key)}
                >
                  {show_key ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !key.trim()}>
              {loading ? "验证中..." : "登 录"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
