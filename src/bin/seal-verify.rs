use anyhow::{bail, Context, Result};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::env;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct SealManifest {
    task_id: String,
    exported_by: String,
    exported_at: String,
    files: Vec<SealManifestFile>,
    signature: String,
}

#[derive(Debug, Deserialize)]
struct SealManifestFile {
    name: String,
    sha256: String,
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{:02x}", byte)).collect()
}

fn seal_signature(manifest: &SealManifest) -> String {
    let mut hasher = Sha256::new();
    hasher.update(manifest.task_id.as_bytes());
    hasher.update(manifest.exported_by.as_bytes());
    hasher.update(manifest.exported_at.as_bytes());
    for file in &manifest.files {
        hasher.update(file.name.as_bytes());
        hasher.update(file.sha256.as_bytes());
    }
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect()
}

fn verify_package(path: PathBuf) -> Result<()> {
    let file = File::open(&path).with_context(|| format!("failed to open {}", path.display()))?;
    let mut archive = zip::ZipArchive::new(file).context("failed to read sealed package zip")?;
    let manifest: SealManifest = {
        let mut manifest_file = archive
            .by_name("manifest.json")
            .context("manifest.json is missing")?;
        let mut manifest_text = String::new();
        manifest_file
            .read_to_string(&mut manifest_text)
            .context("failed to read manifest.json")?;
        serde_json::from_str(&manifest_text).context("manifest.json is not valid seal manifest JSON")?
    };

    for expected in &manifest.files {
        let mut sealed_file = archive
            .by_name(&expected.name)
            .with_context(|| format!("sealed file missing: {}", expected.name))?;
        let mut bytes = Vec::new();
        sealed_file
            .read_to_end(&mut bytes)
            .with_context(|| format!("failed to read sealed file: {}", expected.name))?;
        let actual = sha256_hex(&bytes);
        if actual != expected.sha256 {
            bail!(
                "sha256 mismatch for {}: expected {}, got {}",
                expected.name,
                expected.sha256,
                actual
            );
        }
    }

    let expected_signature = seal_signature(&manifest);
    if expected_signature != manifest.signature {
        bail!(
            "signature mismatch: expected {}, got {}",
            expected_signature,
            manifest.signature
        );
    }

    Ok(())
}

fn main() {
    let mut args = env::args_os().skip(1);
    let Some(path) = args.next() else {
        eprintln!("Usage: seal-verify <package>");
        std::process::exit(2);
    };

    match verify_package(PathBuf::from(path)) {
        Ok(()) => {
            println!("OK");
        }
        Err(error) => {
            eprintln!("{error:#}");
            std::process::exit(1);
        }
    }
}
