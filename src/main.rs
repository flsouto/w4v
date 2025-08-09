use clap::Parser;
use std::fs;
use wasm_example::reverb::{reverb, ReverbArgs};
use wasm_example::reverse::{reverse, ReverseArgs};
use wasm_example::reverb_reverse::{reverb_reverse, ReverbReverseArgs};

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
    Reverb(ReverbArgs),
    Reverse(ReverseArgs),
    ReverbReverse(ReverbReverseArgs),
}

fn main() -> Result<(), String> {
    let cli = Cli::parse();

    match &cli.command {
        Commands::Reverb(args) => {
            println!("Applying reverb to {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = reverb(input_wav, args.delay, args.decay)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Reverse(args) => {
            println!("Reversing {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = reverse(input_wav)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::ReverbReverse(args) => {
            println!("Applying reverb and reverse to {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = reverb_reverse(input_wav, args.delay, args.decay)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
    }

    Ok(())
}