const webp = require("node-webpmux");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const { tmpdir } = require("os");
const crypto = require("crypto");
const path = require("path");
try {
    ffmpeg.setFfmpegPath(require("@ffmpeg-installer/ffmpeg").path);
} catch (_) {
    // Android/Termux: no bundled binary, use system ffmpeg
    ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || "ffmpeg");
}

class StickerBuilder {
  constructor() {
    this.tmp = tmpdir();
  }

  _tmp(ext) {
    return path.join(
      this.tmp,
      `${crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.${ext}`
    );
  }

  async toSticker(type, media, exif = null) {
    const ext = type === "image" ? "jpg" : "mp4";
    const input = this._tmp(ext);
    const output = this._tmp("webp");

    fs.writeFileSync(input, media);

    await new Promise((resolve, reject) => {
      ffmpeg(input)
        .on("error", reject)
        .on("end", () => resolve(true))
        .addOutputOptions(
          ext === "jpg"
            ? [
                "-vcodec",
                "libwebp",
                "-vf",
                "scale=320:320:force_original_aspect_ratio=increase,crop=320:320,fps=15",
              ]
            : [
                "-vcodec",
                "libwebp",
                "-vf",
                "scale=320:320:force_original_aspect_ratio=increase,crop=320:320,fps=15",
                "-loop",
                "0",
                "-ss",
                "00:00:00",
                "-t",
                "00:00:05",
                "-preset",
                "default",
                "-an",
                "-vsync",
                "0",
              ]
        )
        .toFormat("webp")
        .save(output);
    });

    const buffer = fs.readFileSync(output);
    fs.unlinkSync(input);
    fs.unlinkSync(output);

    return exif ? await this.addExif(buffer, exif) : buffer;
  }

  async circleImage(media) {
    const input = this._tmp("png");
    const output = this._tmp("png");

    fs.writeFileSync(input, media);

    await new Promise((resolve, reject) => {
      ffmpeg(input)
        .on("error", reject)
        .on("end", () => resolve(true))
        .addOutputOptions([
          "-vf",
          "scale=320:320:force_original_aspect_ratio=increase,crop=320:320," +
            "format=rgba,geq='if((X-W/2)^2+(Y-H/2)^2>(min(W,H)/2)^2,0,255)':128:128:128",
        ])
        .toFormat("png")
        .save(output);
    });
    const buffer = fs.readFileSync(output);
    fs.unlinkSync(input);
    fs.unlinkSync(output);

    return buffer;
  }

  // ✅ FIX: circled PNG ko direct webp mein convert karo, "image"/jpg path se mat bhejo
  async toCircleSticker(media, exif = null) {
    const circled = await this.circleImage(media);
    const input = this._tmp("png");
    const output = this._tmp("webp");

    fs.writeFileSync(input, circled);

    await new Promise((resolve, reject) => {
      ffmpeg(input)
        .on("error", reject)
        .on("end", () => resolve(true))
        .addOutputOptions([
          "-vcodec",
          "libwebp",
          "-vf",
          "scale=320:320:force_original_aspect_ratio=decrease,format=rgba",
        ])
        .toFormat("webp")
        .save(output);
    });

    const buffer = fs.readFileSync(output);
    fs.unlinkSync(input);
    fs.unlinkSync(output);

    return exif ? await this.addExif(buffer, exif) : buffer;
  }

  async addExif(webpSticker, info) {
    const img = new webp.Image();
    const { packname, author, categories } = info;
    const json = {
      "sticker-pack-id": [...Array(32)]
        .map(() =>
          Math.floor(Math.random() * 256)
            .toString(16)
            .padStart(2, "0")
        )
        .join(""),
      "sticker-pack-name": packname || "",
      "sticker-pack-publisher": author || "",
      emojis: categories || ["💖"],
      "android-app-store-link": "https://github.com/devrickydewizard/PRIME-MD",
      "ios-app-store-link": "https://github.com/devrickydewizard/PRIME-MD",
    };

    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);

    const jsonBuffer = Buffer.from(JSON.stringify(json), "utf8");
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);

    await img.load(webpSticker);
    img.exif = exif;
    return await img.save(null);
  }

  async getExif(sticker) {
    const img = new webp.Image();
    await img.load(sticker);
    const json = JSON.parse(
      img.exif
        .slice(22)
        .toString()
        .replace("sticker-pack-name", "sticker_pack_name")
        .replace("sticker-pack-publisher", "sticker_pack_publisher")
    );
    return {
      packname: json.sticker_pack_name,
      author: json.sticker_pack_publisher,
    };
  }

  async toVideo(webpBuffer) {
    const input = this._tmp("webp");
    const output = this._tmp("mp4");

    fs.writeFileSync(input, webpBuffer);

    await new Promise((resolve, reject) => {
      ffmpeg(input)
        .on("error", reject)
        .on("end", () => resolve(true))
        .outputOptions([
          "-movflags",
          "faststart",
          "-pix_fmt",
          "yuv420p",
        ])
        .toFormat("mp4")
        .save(output);
    });

    const buffer = fs.readFileSync(output);

    fs.unlinkSync(input);
    fs.unlinkSync(output);

    return buffer;
  }
}

module.exports = new StickerBuilder();
