use std::path::Path;

use crate::error::CoreError;

/// Convert an image file at `input` to `output`, inferring formats from extensions.
pub fn convert(input: &Path, output: &Path, quality: u8) -> Result<(), CoreError> {
    let img = image::open(input)?;

    let output_ext = output
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match output_ext.as_str() {
        "jpg" | "jpeg" => {
            let mut out_file = std::fs::File::create(output)?;
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out_file, quality);
            img.write_with_encoder(encoder)?;
        }
        "png" => {
            img.save_with_format(output, image::ImageFormat::Png)?;
        }
        "webp" => {
            img.save_with_format(output, image::ImageFormat::WebP)?;
        }
        "avif" => {
            img.save_with_format(output, image::ImageFormat::Avif)?;
        }
        fmt => {
            return Err(CoreError::UnsupportedFormat(fmt.to_string()));
        }
    }

    Ok(())
}
