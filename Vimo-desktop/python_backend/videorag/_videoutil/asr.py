import os
import logging
from faster_whisper import WhisperModel
from .._utils import logger


def speech_to_text(video_name, working_dir, segment_index2name, audio_output_format, global_config):
    """
    Local speech-to-text using faster-whisper.

    Args:
        video_name: Name of the video
        working_dir: Working directory
        segment_index2name: Mapping of segment indices to names
        audio_output_format: Audio file format
        global_config: Global configuration dictionary containing settings
    """
    model_name = global_config.get('asr_model', 'large-v3')
    logger.info(f"🎤 Loading Whisper model '{model_name}' for local ASR...")

    try:
        model = WhisperModel(model_name)
        model.logger.setLevel(logging.WARNING)
    except Exception as e:
        raise RuntimeError(
            f"Failed to load Whisper model '{model_name}'. "
            f"Supported sizes: tiny, base, small, medium, large-v1, large-v2, large-v3, "
            f"distil-large-v2, distil-large-v3. Error: {e}"
        ) from e

    cache_path = os.path.join(working_dir, '_cache', video_name)

    total_segments = len(segment_index2name)
    logger.info(f"🎤 Starting local ASR for {total_segments} audio segments...")

    transcripts = {}
    completed = 0
    for index in segment_index2name:
        segment_name = segment_index2name[index]
        audio_file = os.path.join(cache_path, f"{segment_name}.{audio_output_format}")

        if not os.path.exists(audio_file):
            logger.warning(f"Audio file not found, skipping: {audio_file}")
            transcripts[index] = ""
            completed += 1
            continue

        try:
            segments, _info = model.transcribe(audio_file)
            result = ""
            for segment in segments:
                result += segment.text + "\n"
            transcripts[index] = result.strip()
            completed += 1
            logger.info(
                f"✅ Completed {completed}/{total_segments} segments "
                f"(Progress: {completed / total_segments * 100:.1f}%)"
            )
        except Exception as e:
            logger.error(f"❌ ASR failed for segment {segment_name}: {e}")
            transcripts[index] = ""
            completed += 1

    logger.info(f"🎉 ASR processing completed! Processed {len(transcripts)} segments successfully.")
    return transcripts