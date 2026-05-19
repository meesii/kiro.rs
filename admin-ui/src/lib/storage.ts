/**
 * API Key 本地存储
 */
export const storage = {
  get_api_key(): string | null {
    return localStorage.getItem("adminApiKey")
  },

  set_api_key(key: string) {
    localStorage.setItem("adminApiKey", key)
  },

  remove_api_key() {
    localStorage.removeItem("adminApiKey")
  },
}
