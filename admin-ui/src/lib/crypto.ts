/**
 * 根据凭据信息生成 Machine ID（纯前端实现，对齐后端 machine_id.rs 兜底算法）
 */
export async function generate_machine_id(): Promise<string> {
    const uuid = crypto.randomUUID();
    const seed = `KiroFallback/${uuid}`;
    return await sha256_hex(seed);
}

/**
 * SHA256 哈希（浏览器 Web Crypto API）
 */
async function sha256_hex(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hash_buffer = await crypto.subtle.digest('SHA-256', data);
    const hash_array = Array.from(new Uint8Array(hash_buffer));
    return hash_array.map((b) => b.toString(16).padStart(2, '0')).join('');
}
