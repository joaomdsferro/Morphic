pub mod error;
pub mod image;

pub use error::CoreError;

/// A unified conversion request passed from the Tauri layer.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ConvertRequest {
    /// Absolute path to the source file.
    pub input_path: std::path::PathBuf,
    /// Absolute path for the output file (including desired extension).
    pub output_path: std::path::PathBuf,
    /// Quality (1–100). Interpretation depends on the codec.
    pub quality: u8,
}

/// A summary returned after a successful conversion.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ConvertResult {
    pub output_path: std::path::PathBuf,
    pub input_size_bytes: u64,
    pub output_size_bytes: u64,
}

/// Convert a file, inferring the input and output formats from the file extensions.
pub fn convert_file(req: ConvertRequest) -> Result<ConvertResult, CoreError> {
    let input_meta = std::fs::metadata(&req.input_path)?;
    let input_size_bytes = input_meta.len();

    image::convert(&req.input_path, &req.output_path, req.quality)?;

    let output_size_bytes = std::fs::metadata(&req.output_path)?.len();

    Ok(ConvertResult {
        output_path: req.output_path,
        input_size_bytes,
        output_size_bytes,
    })
}
