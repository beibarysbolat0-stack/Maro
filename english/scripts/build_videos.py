#!/usr/bin/env python3
"""Build original, narrated lesson videos from the checked-in LingoStep curriculum.

Requires Node.js, Pillow and FFmpeg with the Flite filter. The MP4 files are
static assets; visitors do not need any of these build tools or a paid service.
"""
from __future__ import annotations

import json
import math
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'video'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
WIDTH, HEIGHT = 960, 540
PALETTES = {
    'mint': ('#e1f1e5', '#79bb92'), 'peach': ('#f7e4d3', '#e7ad81'),
    'lavender': ('#eee5f7', '#ad8dc9'), 'sky': ('#e0edf7', '#7aaed1'),
    'lemon': ('#f5efd0', '#d4bc68'),
}


def run(*command: str) -> None:
    result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if result.returncode:
        raise RuntimeError(f"{' '.join(command)}\n{result.stderr}")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(BOLD if bold else FONT, size)


def wrapped(draw: ImageDraw.ImageDraw, text: str, max_width: int, face: ImageFont.FreeTypeFont) -> list[str]:
    rows: list[str] = []
    current = ''
    for word in text.split():
        candidate = (current + ' ' + word).strip()
        if draw.textbbox((0, 0), candidate, font=face)[2] > max_width and current:
            rows.append(current)
            current = word
        else:
            current = candidate
    if current:
        rows.append(current)
    return rows


def draw_lines(draw: ImageDraw.ImageDraw, rows: list[str], top: int, face: ImageFont.FreeTypeFont,
               fill: str, gap: int) -> int:
    y = top
    for line in rows:
        draw.text((81, y), line, font=face, fill=fill)
        y += face.size + gap
    return y


def scene_image(lesson: dict, scene: dict, number: int, total: int, path: Path) -> None:
    background, accent = PALETTES[lesson['accent']]
    image = Image.new('RGB', (WIDTH, HEIGHT), background)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((38, 35, 922, 505), radius=34, fill='#ffffff')
    draw.rounded_rectangle((66, 67, 154, 111), radius=13, fill=accent)
    draw.text((85, 76), 'L.', font=font(25, True), fill='#203033')
    draw.text((169, 78), 'LINGOSTEP  /  ВИДЕОУРОК', font=font(19, True), fill='#587368')
    draw.text((74, 141), scene['label'].upper(), font=font(19, True), fill='#53806b')
    title_font = font(57 if len(scene['title']) < 40 else 46, True)
    title_rows = wrapped(draw, scene['title'], 814, title_font)
    y = draw_lines(draw, title_rows[:3], 184, title_font, '#203033', 10)
    if scene.get('russian'):
        ru_font = font(30)
        y = draw_lines(draw, wrapped(draw, scene['russian'], 810, ru_font)[:3], y+10, ru_font, '#61766e', 9)
    if scene.get('example'):
        draw.rounded_rectangle((75, 409, 885, 461), radius=14, fill=background)
        ex_font = font(22)
        draw.text((94, 422), scene['example'][:60], font=ex_font, fill='#405b4e')
    for dot in range(total):
        x = 78 + dot * 28
        draw.ellipse((x, 481, x+13, 494), fill=accent if dot <= number else '#dae4dd')
    draw.text((773, 477), f'{number+1:02d} / {total:02d}', font=font(16, True), fill='#82938a')
    image.save(path)


def make_scenes(lesson: dict) -> list[dict]:
    lesson_name = lesson['title']
    scenes = [
        {'label': 'Тема урока', 'title': lesson_name, 'russian': lesson['subtitle'],
         'example': 'Слушай • повторяй • говори', 'speech': 'Welcome. Listen and repeat with me.', 'voice': 'slt'},
        {'label': 'Короткое правило', 'title': 'Смотри и слушай', 'russian': lesson['grammar'],
         'speech': lesson['words'][0][2], 'voice': 'awb'},
    ]
    for word, translation, example in lesson['words'][:3]:
        scenes.append({'label': 'Полезное слово', 'title': word, 'russian': translation,
                       'example': example, 'speech': f'{word}. {example}', 'voice': 'slt'})
    for speaker, english, russian in lesson['dialogue']:
        scenes.append({'label': f'Диалог / {speaker}', 'title': english,
                       'russian': russian, 'speech': english, 'voice': 'awb' if speaker == 'A' else 'slt'})
    english = lesson['dialogue'][-1][1]
    russian = lesson['dialogue'][-1][2]
    scenes.append({'label': 'Твоя очередь / повтори вслух', 'title': english,
                   'russian': russian, 'example': 'Произнеси фразу в паузе после озвучки',
                   'speech': f'Your turn. Repeat after me. {english}', 'voice': 'slt', 'pause': 4.5})
    scenes.append({'label': 'Отличная работа', 'title': 'Повтори ещё раз',
                   'russian': 'Попробуй произнести фразы без подсказки.',
                   'example': 'Следующий шаг — тренировка в приложении',
                   'speech': 'Great work. Practice again tomorrow.', 'voice': 'awb'})
    return scenes


def build_lesson(lesson: dict) -> tuple[str, float, int]:
    output = OUTPUT / f"{lesson['id']}.mp4"
    scenes = make_scenes(lesson)
    with tempfile.TemporaryDirectory(prefix=f"lingostep-{lesson['id']}-") as temporary:
        temp = Path(temporary)
        image_manifest = temp / 'images.ffconcat'
        audio_manifest = temp / 'audio.ffconcat'
        images, audios = [], []
        total_duration = 0.0
        for index, scene in enumerate(scenes):
            image_path = temp / f'slide-{index:02d}.png'
            text_path = temp / f'speech-{index:02d}.txt'
            raw_path = temp / f'raw-{index:02d}.wav'
            audio_path = temp / f'audio-{index:02d}.wav'
            scene_image(lesson, scene, index, len(scenes), image_path)
            text_path.write_text(scene['speech'].replace('’', "'"), encoding='utf-8')
            run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
                '-i', f"flite=textfile={text_path}:voice={scene['voice']}",
                '-ar', '24000', '-ac', '1', str(raw_path))
            probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                    '-of', 'default=noprint_wrappers=1:nokey=1', str(raw_path)],
                                   check=True, capture_output=True, text=True)
            duration = math.ceil((float(probe.stdout.strip()) + scene.get('pause', 1.5))*12)/12
            run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(raw_path),
                '-af', 'apad', '-t', str(duration), '-ar', '24000', '-ac', '1', str(audio_path))
            images.append((image_path, duration))
            audios.append(audio_path)
            total_duration += duration
        image_manifest.write_text('ffconcat version 1.0\n' + ''.join(
            f"file '{path}'\nduration {duration:.6f}\n" for path,duration in images) + f"file '{images[-1][0]}'\n")
        audio_manifest.write_text('ffconcat version 1.0\n' + ''.join(f"file '{path}'\n" for path in audios))
        video = temp / 'video.mp4'
        audio = temp / 'audio.m4a'
        run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-safe', '0', '-f', 'concat',
            '-i', str(image_manifest), '-r', '12', '-c:v', 'libx264',
            '-preset', 'veryfast', '-crf', '29', '-pix_fmt', 'yuv420p', '-an', str(video))
        run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-safe', '0', '-f', 'concat',
            '-i', str(audio_manifest), '-c:a', 'aac', '-b:a', '56k', str(audio))
        run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(video), '-i', str(audio),
            '-c', 'copy', '-shortest', '-movflags', '+faststart', str(output))
        poster = OUTPUT / f"{lesson['id']}.jpg"
        Image.open(images[0][0]).save(poster, quality=85, optimize=True)
    return lesson['id'], total_duration, output.stat().st_size


def main() -> None:
    command = ['node', '-e', "global.window={};require('./public/curriculum.js');require('./public/extra-words.js');process.stdout.write(JSON.stringify(window.LESSONS))"]
    lessons = json.loads(subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for lesson in lessons:
        name, duration, size = build_lesson(lesson)
        print(f'{name}: {duration:.0f}s, {size/1024/1024:.2f} MiB', flush=True)


if __name__ == '__main__':
    main()
