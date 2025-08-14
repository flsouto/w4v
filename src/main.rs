use clap::Parser;
use std::fs;
use rand::seq::SliceRandom;
use rand::rngs::StdRng;
use rand::SeedableRng;
use w4v::reverb::{reverb, ReverbArgs};
use w4v::maxgain::{maxgain, MaxGainArgs};
use w4v::gain::{gain, GainArgs};
use w4v::overdrive::{overdrive, OverdriveArgs};
use w4v::chop::{chop, ChopArgs};
use w4v::add::{add, AddArgs};
use w4v::x::{x, XArgs};
use w4v::bitcrush::{bitcrush, BitcrushArgs};
use w4v::reverse::{reverse, ReverseArgs};
use w4v::speed::{speed, SpeedArgs};
use w4v::len::{len, LenArgs};
use w4v::resize::{resize, ResizeArgs};
use w4v::flanger::{flanger, FlangerArgs};
use w4v::cut::{cut, CutArgs};
use w4v::pick::{pick, PickArgs};
use w4v::fade::{fade, FadeArgs};
use w4v::highpass::{highpass, HighpassArgs};
use w4v::lowpass::{lowpass, LowpassArgs};
use w4v::remix::{remix, RemixArgs};
use w4v::mosaic::{mosaic, MosaicArgs};
use w4v::blend::{blend, BlendArgs};
use w4v::mix::{mix, MixArgs};


#[derive(Parser)]
#[command(name = "wav-effects")]
#[command(author = "Gemini")]
#[command(version = "1.0")]
#[command(about = "Applies effects to WAV files", long_about = None)]
struct Cli {
    #[arg(long, help = "Optional seed for random operations")]
    seed: Option<u64>,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Parser)]
enum Commands {
    Reverb(ReverbArgs),
    Reverse(ReverseArgs),
    Speed(SpeedArgs),
    Len(LenArgs),
    Resize(ResizeArgs),
    Flanger(FlangerArgs),
    Cut(CutArgs),
    Pick(PickArgs),
    Fade(FadeArgs),
    Highpass(HighpassArgs),
    Lowpass(LowpassArgs),
    Bitcrush(BitcrushArgs),
    X(XArgs),
    Add(AddArgs),
    Chop(ChopArgs),
    Overdrive(OverdriveArgs),
    Gain(GainArgs),
    #[command(name = "maxgain")]
    MaxGain(MaxGainArgs),
    Remix(RemixArgs),
    Mosaic(MosaicArgs),
    Blend(BlendArgs),
    Mix(MixArgs),
}

fn main() -> Result<(), String> {
    let cli = Cli::parse();

    match &cli.command {
        Commands::Reverb(args) => {
            println!("Applying reverb to {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = reverb(&input_wav, args.delay, args.decay)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Reverse(args) => {
            println!("Reversing {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = reverse(&input_wav)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Speed(args) => {
            println!("Changing speed of {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = speed(&input_wav, args.factor)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Len(args) => {
            println!("Calculating length of {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let duration = len(&input_wav)?;
            println!("Duration: {:.2} seconds", duration);
        }
        Commands::Resize(args) => {
            println!("Resizing {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = resize(&input_wav, args.new_duration)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Flanger(args) => {
            println!("Applying flanger to {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = flanger(&input_wav, args.delay, args.depth, args.rate, args.feedback)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Cut(args) => {
            println!("Cutting {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = cut(&input_wav, &args.start_offset, &args.duration)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Pick(args) => {
            println!("Picking a random segment from {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = pick(&input_wav, &args.duration)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Fade(args) => {
            println!("Applying fade to {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = fade(&input_wav, args.initial_volume, args.end_volume)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Highpass(args) => {
            println!("Applying highpass filter to {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = highpass(&input_wav, args.cutoff_frequency)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Lowpass(args) => {
            println!("Applying lowpass filter to {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = lowpass(&input_wav, args.cutoff_frequency)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Bitcrush(args) => {
            println!("Applying bitcrush effect to {}...", args.input);
            println!("Received semitones value: {}", args.semitones); // Still semitones for now, but it's the bitcrush parameter
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = bitcrush(&input_wav, args.semitones)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::X(args) => {
            println!("Repeating audio {} times for {}...", args.count, args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = x(&input_wav, args.count)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Add(args) => {
            println!("Concatenating {} and {}...", args.input1, args.input2);
            let input_wav1 = fs::read(&args.input1).map_err(|e| format!("Failed to read first input file: {}", e))?;
            let input_wav2 = fs::read(&args.input2).map_err(|e| format!("Failed to read second input file: {}", e))?;
            let output_wav = add(&input_wav1, &input_wav2)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Chop(args) => {
            println!("Applying chop effect to {} with n={}", args.input, args.n);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = chop(&input_wav, args.n)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Overdrive(args) => {
            println!("Applying overdrive to {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = overdrive(&input_wav, args.gain, args.output_gain)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Gain(args) => {
            println!("Applying gain of {}dB to {}...", args.gain, args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = gain(&input_wav, args.gain)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::MaxGain(args) => {
            println!("Applying max non-clipping gain to {}...", args.input);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = maxgain(&input_wav)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Remix(args) => {
            println!("Remixing {} with pattern '{}'...", args.input, args.pattern);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = remix(&input_wav, &args.pattern)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }
        Commands::Mosaic(args) => {
            println!("Creating mosaic of {} with pattern '{}'...", args.input, args.pattern);
            let input_wav = fs::read(&args.input).map_err(|e| format!("Failed to read input file: {}", e))?;
            let output_wav = mosaic(&input_wav, &args.pattern, args.segment_len)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        },
        Commands::Blend(args) => {
            println!("Blending wavs in '{}' with '{}'...", args.input_folder, args.blender);

            let mut rng: StdRng = match cli.seed {
                Some(s) => SeedableRng::seed_from_u64(s),
                None => SeedableRng::from_entropy(),
            };

            let entries = fs::read_dir(&args.input_folder)
                .map_err(|e| format!("Failed to read input folder: {}", e))?
                .filter_map(|entry| entry.ok())
                .filter(|entry| entry.path().extension().map_or(false, |ext| ext == "wav"))
                .collect::<Vec<_>>();

            if entries.len() < 4 {
                return Err("Input folder must contain at least 4 WAV files".to_string());
            }

            let mut samples = Vec::new();
            for entry in entries.choose_multiple(&mut rng, 4) {
                let wav_data = fs::read(entry.path()).map_err(|e| {
                    format!("Failed to read WAV file '{}': {}", entry.path().display(), e)
                })?;
                samples.push(wav_data);
            }

            let mut samples_refs = Vec::new();
            for wav_data in &samples {
                samples_refs.push(wav_data.as_slice());
            }

            let output_wav = blend(&samples_refs, &mut rng, &args.blender)?;
            fs::write(&args.output_path, output_wav)
                .map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output_path);
        }
        Commands::Mix(args) => {
            println!("Mixing {} and {}...", args.input1, args.input2);
            let input_wav1 = fs::read(&args.input1).map_err(|e| format!("Failed to read first input file: {}", e))?;
            let input_wav2 = fs::read(&args.input2).map_err(|e| format!("Failed to read second input file: {}", e))?;
            let output_wav = mix(&input_wav1, &input_wav2, args.normalize)?;
            fs::write(&args.output, output_wav).map_err(|e| format!("Failed to write output file: {}", e))?;
            println!("Saved to {}", args.output);
        }        
    }

    Ok(())
}
