import { createContext, useContext, useEffect, useState } from "react"

type Theme = "light" | "dark"

interface ThemeContextType {
  theme: Theme
  toggle_theme: () => void
}

const theme_context = createContext<ThemeContextType>({
  theme: "light",
  toggle_theme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, set_theme] = useState<Theme>(() => {
    const saved = localStorage.getItem("adminTheme")
    return (saved === "light" || saved === "dark") ? saved : "light"
  })

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(theme)
    localStorage.setItem("adminTheme", theme)
  }, [theme])

  const toggle_theme = () => set_theme((t) => (t === "dark" ? "light" : "dark"))

  return (
    <theme_context.Provider value={{ theme, toggle_theme }}>
      {children}
    </theme_context.Provider>
  )
}

export function use_theme() {
  return useContext(theme_context)
}
