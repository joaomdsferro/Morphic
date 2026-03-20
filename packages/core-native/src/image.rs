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
        "ico" => {
            img.save_with_format(output, image::ImageFormat::Ico)?;
        }
        "svg" => {
            use base64::Engine as _;
            use std::io::Write;
            let mut png_buf = Vec::new();
            img.write_to(&mut std::io::Cursor::new(&mut png_buf), image::ImageFormat::Png)?;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&png_buf);
            let w = img.width();
            let h = img.height();
            let svg = format!(
                r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><image href="data:image/png;base64,{b64}" width="{w}" height="{h}"/></svg>"#
            );
            let mut out_file = std::fs::File::create(output)?;
            out_file.write_all(svg.as_bytes())?;
        }
        fmt => {
            return Err(CoreError::UnsupportedFormat(fmt.to_string()));
        }
    }

    Ok(())
}
