/**
 * 生成 UUID v4（兼容所有浏览器，crypto.randomUUID() 在非安全上下文中不可用）
 */
function uuid_v4(): string {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const arr = crypto.getRandomValues(new Uint8Array(16));
        arr[6] = (arr[6] & 0x0f) | 0x40;
        arr[8] = (arr[8] & 0x3f) | 0x80;
        return [...arr]
            .map((b, i) => {
                const hex = b.toString(16).padStart(2, '0');
                return [4, 6, 8, 10].includes(i) ? '-' + hex : hex;
            })
            .join('');
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * 根据凭据信息生成 Machine ID（纯前端实现，对齐后端 machine_id.rs 兜底算法）
 */
export async function generate_machine_id(): Promise<string> {
    const uuid = uuid_v4();
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
