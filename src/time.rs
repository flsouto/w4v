pub fn parse_time(s: &str) -> Result<(bool, f32), String> {
    // Try parsing as absolute float
    if let Ok(val) = s.parse::<f32>() {
        if val >= 0.0 {
            Ok((false, val))
        } else {
            Err("Duration cannot be negative".to_string())
        }
    } else {
        // Try parsing as fraction (e.g., "1/2", "3/4")
        let parts: Vec<&str> = s.split('/').collect();
        if parts.len() == 2 {
            if let (Ok(numerator), Ok(denominator)) = (parts[0].parse::<f32>(), parts[1].parse::<f32>()) {
                if denominator != 0.0 {
                    Ok((true, numerator / denominator))
                } else {
                    Err("Denominator cannot be zero".to_string())
                }
            } else {
                Err(format!("Invalid fraction format: {}", s))
            }
        } else {
            Err(format!("Invalid time format: {}", s))
        }
    }
}

pub fn resolve_time(time_str: &str, total_duration: f32) -> Result<f32, String> {
    let (is_fraction, value) = parse_time(time_str)?;
    if is_fraction {
        Ok(value * total_duration)
    } else {
        Ok(value)
    }
}