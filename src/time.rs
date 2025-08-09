use std::str::FromStr;

#[derive(Clone, Debug)]
pub enum Time {
    Absolute(f32),
    Fraction(f32),
}

impl Time {
    pub fn abs(value: f32) -> Self {
        Time::Absolute(value)
    }

    pub fn fract(value: f32) -> Self {
        Time::Fraction(value)
    }
}

impl FromStr for Time {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        // Try parsing as absolute float
        if let Ok(val) = s.parse::<f32>() {
            if val >= 0.0 {
                Ok(Time::Absolute(val))
            } else {
                Err("Duration cannot be negative".to_string())
            }
        } else {
            // Try parsing as fraction (e.g., "1/2", "3/4")
            let parts: Vec<&str> = s.split('/').collect();
            if parts.len() == 2 {
                if let (Ok(numerator), Ok(denominator)) = (parts[0].parse::<f32>(), parts[1].parse::<f32>()) {
                    if denominator != 0.0 {
                        Ok(Time::Fraction(numerator / denominator))
                    } else {
                        Err("Denominator cannot be zero".to_string())
                    }
                } else {
                    Err(format!("Invalid fraction format: {}", s))
                }
            } else {
                Err(format!("Invalid fraction format: {}", s))
            }
        }
    }
}

impl Time {
    // Method to resolve the actual duration based on total_wav_duration
    pub fn resolve(&self, total_wav_duration: f32) -> Result<f32, String> {
        match self {
            Time::Absolute(val) => Ok(*val),
            Time::Fraction(factor) => {
                if total_wav_duration >= 0.0 {
                    Ok(total_wav_duration * factor)
                } else {
                    Err("Cannot resolve fraction with negative total WAV duration".to_string())
                }
            }
        }
    }
}



