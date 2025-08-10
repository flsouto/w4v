use clap::Parser;
use std::fs;
use w4v::reverb::{reverb, ReverbArgs};
use w4v::reverse::{reverse, ReverseArgs};
use w4v::reverb_reverse::{reverb_reverse, ReverbReverseArgs};
use w4v::speed::{speed, SpeedArgs};
use w4v::len::{len, LenArgs};
use w4v::resize::{resize, ResizeArgs};
use w4v::flanger::{flanger, FlangerArgs};
use w4v::cut::{cut, CutArgs};
use w4v::pick::{pick, PickArgs};
use w4v::fade::{fade, FadeArgs};
use w4v::highpass::{highpass, HighpassArgs};
use w4v::lowpass::{lowpass, LowpassArgs};


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
    Speed(SpeedArgs),
    Len(LenArgs),
    Resize(ResizeArgs),
    Flanger(FlangerArgs),
    Cut(CutArgs),
    Pick(PickArgs),
    Fade(FadeArgs),
    Highpass(HighpassArgs),
    Lowpass(LowpassArgs),
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
        Commands::Speed(args) => {
            println!("Changing speed of {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = speed(input_wav, args.factor)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Len(args) => {
            println!("Calculating length of {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let duration = len(input_wav)?;
            println!("Duration: {:.2} seconds", duration);
        }
        Commands::Resize(args) => {
            println!("Resizing {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = resize(input_wav, args.new_duration)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Flanger(args) => {
            println!("Applying flanger to {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = flanger(input_wav, args.delay, args.depth, args.rate, args.feedback)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Cut(args) => {
            println!("Cutting {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = cut(input_wav, &args.start_offset, &args.duration)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Pick(args) => {
            println!("Picking a random segment from {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = pick(input_wav, &args.duration)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Fade(args) => {
            println!("Applying fade to {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = fade(input_wav, args.initial_volume, args.end_volume)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Highpass(args) => {
            println!("Applying highpass filter to {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = highpass(input_wav, args.cutoff_frequency)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Lowpass(args) => {
            println!("Applying lowpass filter to {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = lowpass(input_wav, args.cutoff_frequency)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
    }

    Ok(())
}