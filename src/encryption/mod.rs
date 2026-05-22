use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedData {
    pub ciphertext: String,
    pub nonce: String,
    pub encrypted_at: String,
    pub key_scope: String,
}

pub fn generate_data_key() -> String {
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    BASE64.encode(key)
}

pub fn decode_data_key(key_b64: &str) -> Result<Vec<u8>> {
    let decoded = BASE64
        .decode(key_b64)
        .context("failed to decode data key")?;
    if decoded.len() != 32 {
        anyhow::bail!("data key must be 32 bytes");
    }
    Ok(decoded)
}

pub fn encrypt_with_key(
    plaintext: &str,
    key_bytes: &[u8],
    key_scope: &str,
) -> Result<EncryptedData> {
    let cipher = Aes256Gcm::new_from_slice(key_bytes).context("failed to initialize cipher")?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| anyhow::anyhow!("encryption failed: {}", e))?;

    Ok(EncryptedData {
        ciphertext: BASE64.encode(ciphertext),
        nonce: BASE64.encode(nonce_bytes),
        encrypted_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        key_scope: key_scope.to_string(),
    })
}

pub fn decrypt_with_key(encrypted: &EncryptedData, key_bytes: &[u8]) -> Result<String> {
    let cipher = Aes256Gcm::new_from_slice(key_bytes).context("failed to initialize cipher")?;
    let ciphertext = BASE64
        .decode(&encrypted.ciphertext)
        .context("failed to decode ciphertext")?;
    let nonce_bytes = BASE64
        .decode(&encrypted.nonce)
        .context("failed to decode nonce")?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| anyhow::anyhow!("decryption failed"))?;
    String::from_utf8(plaintext).context("failed to decode plaintext")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypts_and_decrypts_with_managed_key() {
        let key_b64 = generate_data_key();
        let key = decode_data_key(&key_b64).unwrap();
        let encrypted = encrypt_with_key("hello", &key, "tenant:test").unwrap();
        let decrypted = decrypt_with_key(&encrypted, &key).unwrap();
        assert_eq!(decrypted, "hello");
        assert_eq!(encrypted.key_scope, "tenant:test");
    }
}
