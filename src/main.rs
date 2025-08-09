use clap::Parser;
use std::fs;
use wasm_example::reverb::reverb;
use wasm_example::reverse::reverse;
use wasm_example::reverb_reverse::reverb_reverse;

#[derive(Parser)]
#[command(name = "wav-effects")]
#[command(author = "Gemini")]
#[command(version = "1.0")]
#[command(about = "Applies effects to WAV files", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Parser)]
enum Commands {
    /// Applies a reverb effect to a WAV file
    Reverb {
        /// Input WAV file
        #[arg(short, long)]
        input: String,

        /// Output WAV file
        #[arg(short, long)]
        output: String,

        /// Delay in milliseconds
        #[arg(long, default_value_t = 400)]
        delay: u32,

        /// Decay factor
        #[arg(long, default_value_t = 0.5)]
        decay: f32,
    },
    /// Reverses a WAV file
    Reverse {
        /// Input WAV file
        #[arg(short, long)]
        input: String,

        /// Output WAV file
        #[arg(short, long)]
        output: String,
    },
    /// Applies reverb and then reverses a WAV file
    ReverbReverse {
        /// Input WAV file
        #[arg(short, long)]
        input: String,

        /// Output WAV file
        #[arg(short, long)]
        output: String,

        /// Delay in milliseconds
        #[arg(long, default_value_t = 400)]
        delay: u32,

        /// Decay factor
        #[arg(long, default_value_t = 0.5)]
        decay: f32,
    },
}

fn main() -> Result<(), String> {
    let cli = Cli::parse();

    match &cli.command {
        Commands::Reverb { input, output, delay, decay } => {
            println!("Applying reverb to {}...", input);
            let input_wav = fs::read(input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = reverb(input_wav, *delay, *decay)?;
            fs::write(output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", output);
        }
        Commands::Reverse { input, output } => {
            println!("Reversing {}...", input);
            let input_wav = fs::read(input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = reverse(input_wav)?;
            fs::write(output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", output);
        }
        Commands::ReverbReverse { input, output, delay, decay } => {
            println!("Applying reverb and reverse to {}...", input);
            let input_wav = fs::read(input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = reverb_reverse(input_wav, *delay, *decay)?;
            fs::write(output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", output);
        }
    }

    Ok(())
}