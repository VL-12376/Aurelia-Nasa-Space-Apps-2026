# Crew audio

These are original, locally generated lines for AURELIA, not samples from films,
games, or mission broadcasts. The generated recordings are dedicated to the
public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
The voices are synthetic; no person is represented as endorsing this game.

Generated with [Piper 2023.11.14-2](https://github.com/rhasspy/piper/releases/tag/2023.11.14-2)
(MIT) and the medium-quality models from
[rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) (MIT).
Each selected model's card identifies its dataset as public domain:

| Character | Voice | Dataset and model card |
| --- | --- | --- |
| Mira (female, aerospace) | ljspeech | [LJ Speech](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD) |
| Elena (female, controller) | kristin | [LibriVox](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/kristin/medium/MODEL_CARD) |
| Kenji (male, propulsion) | john | [LibriVox](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/john/medium/MODEL_CARD) |
| Arjun (male, science) | bryce | [Creator's public-domain recordings](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/bryce/medium/MODEL_CARD) |

Scripts are in `src/audio/crewLines.json`. Regenerate from the repository root:

```powershell
.\scripts\generate-crew-audio.ps1 -Piper C:\tools\piper\piper.exe -Models C:\tools\voices
```

Models and generator executables are development tools only, not shipped with
the game. Unscripted explanations use the device speech engine, if available.
