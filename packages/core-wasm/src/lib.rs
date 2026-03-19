use wasm_bindgen::prelude::*;

// Set up better panic messages in the browser console
pub use console_error_panic_hook::set_once as set_panic_hook;

#[wasm_bindgen(start)]
pub fn init() {
    set_panic_hook();
}

/// Returns the list of supported input formats.
#[wasm_bindgen]
pub fn supported_input_formats() -> Vec<String> {
    vec![
        "jpeg".into(),
        "png".into(),
        "webp".into(),
        "avif".into(),
        "jxl".into(),
        "gif".into(),
        "bmp".into(),
        "tiff".into(),
    ]
}

/// Returns the list of supported output formats.
#[wasm_bindgen]
pub fn supported_output_formats() -> Vec<String> {
    vec![
        "jpeg".into(),
        "png".into(),
        "webp".into(),
        "avif".into(),
        "jxl".into(),
    ]
}

/// Convert raw image bytes from one format to another.
/// `input_format` and `output_format` are lowercase format strings (e.g. "jpeg", "png").
/// Returns the converted bytes or throws a JS error.
#[wasm_bindgen]
pub fn convert_image(
    input_bytes: &[u8],
    input_format: &str,
    output_format: &str,
    quality: u8,
) -> Result<Vec<u8>, JsValue> {
    let fmt = parse_image_format(input_format)
        .ok_or_else(|| JsValue::from_str(&format!("Unsupported input format: {input_format}")))?;

    let img = image::load_from_memory_with_format(input_bytes, fmt)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    encode_image(&img, output_format, quality)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

fn parse_image_format(format: &str) -> Option<image::ImageFormat> {
    match format.to_lowercase().as_str() {
        "jpeg" | "jpg" => Some(image::ImageFormat::Jpeg),
        "png" => Some(image::ImageFormat::Png),
        "webp" => Some(image::ImageFormat::WebP),
        "avif" => Some(image::ImageFormat::Avif),
        "gif" => Some(image::ImageFormat::Gif),
        "bmp" => Some(image::ImageFormat::Bmp),
        "tiff" | "tif" => Some(image::ImageFormat::Tiff),
        _ => None,
    }
}

fn encode_image(
    img: &image::DynamicImage,
    output_format: &str,
    quality: u8,
) -> Result<Vec<u8>, image::ImageError> {
    let mut buf = Vec::new();
    match output_format.to_lowercase().as_str() {
        "jpeg" | "jpg" => {
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
            img.write_with_encoder(encoder)?;
        }
        "png" => {
            img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
        }
        "webp" => {
            img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::WebP)?;
        }
        "avif" => {
            img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Avif)?;
        }
        fmt => {
            return Err(image::ImageError::Unsupported(
                image::error::UnsupportedError::from_format_and_kind(
                    image::error::ImageFormatHint::Name(fmt.to_string()),
                    image::error::UnsupportedErrorKind::Format(
                        image::error::ImageFormatHint::Name(fmt.to_string()),
                    ),
                ),
            ));
        }
    }
    Ok(buf)
}
