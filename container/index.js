const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const dotenv = require("dotenv");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const { spawn } = require("child_process");

dotenv.config();

const BUCKET = process.env.BUCKET_NAME;
const KEY = process.env.KEY;
const OUTPUT_BUCKET = BUCKET;

async function init() {
  console.log("Starting video transcoding process...");
  console.log(`Input: s3://${BUCKET}/${KEY}`);

  try {
    // Initialize S3 client
    const s3Client = new S3Client({
      region: process.env.AWS_REGION,
      // Use ECS task role instead of explicit credentials
    });
    // Create directories
    await fs.mkdir("videos", { recursive: true });
    await fs.mkdir("output", { recursive: true });

    // Download the video from S3
    console.log("Downloading video from S3...");
    const getObjectCommand = new GetObjectCommand({
      Bucket: BUCKET,
      Key: KEY,
    });
    const response = await s3Client.send(getObjectCommand);

    const originalFilePath = "videos/original.mp4";
    await fs.writeFile(originalFilePath, response.Body);
    console.log("Video downloaded successfully");

    // Transcode to HLS
    console.log("Starting HLS transcoding...");
    await transcodeToHLS(originalFilePath);

    console.log("Transcoding completed successfully!");

    // Upload the HLS files to S3
    console.log("Uploading HLS files to S3...");
    const outputDir = "output";
    const outputKey = `production/${KEY.replace(".mp4", "/master.m3u8")}`; // Save in production folder

    const putObjectCommand = new PutObjectCommand({
      Bucket: OUTPUT_BUCKET,
      Key: outputKey,
      Body: fsSync.createReadStream(path.join(outputDir, "master.m3u8")),
      ContentType: "application/vnd.apple.mpegurl",
    });

    await s3Client.send(putObjectCommand);
    console.log(
      `HLS master playlist uploaded successfully to s3://${OUTPUT_BUCKET}/${outputKey}`
    );

    // Upload all segment files
    const segmentFiles = await fs.readdir(outputDir, { recursive: true });
    for (const file of segmentFiles) {
      if (file.endsWith(".ts") || file.endsWith(".m3u8")) {
        const filePath = path.join(outputDir, file);
        const segmentKey = `production/${KEY.replace(".mp4", `/${file}`)}`;

        const segmentCommand = new PutObjectCommand({
          Bucket: OUTPUT_BUCKET,
          Key: segmentKey,
          Body: fsSync.createReadStream(filePath),
          ContentType: file.endsWith(".ts")
            ? "video/mp2t"
            : "application/vnd.apple.mpegurl",
        });

        await s3Client.send(segmentCommand);
        console.log(`Uploaded ${file} to s3://${OUTPUT_BUCKET}/${segmentKey}`);
      }
    }

    // Cleanup
    console.log("Cleaning up temporary files...");
    await fs.rm("videos", { recursive: true, force: true });
    await fs.rm("output", { recursive: true, force: true });
    console.log("Cleanup completed");
  } catch (error) {
    console.error("Error during transcoding:", error);

    process.exit(1);
  }
}

async function transcodeToHLS(inputPath) {
  const outputDir = "output";

  // Define resolutions
  const resolutions = [
    { name: "1080p", width: 1920, height: 1080, bitrate: "5000k" },
    { name: "720p", width: 1280, height: 720, bitrate: "2500k" },
    { name: "480p", width: 854, height: 480, bitrate: "1000k" },
    { name: "360p", width: 640, height: 360, bitrate: "500k" },
  ];

  // Create master playlist
  const masterPlaylistPath = path.join(outputDir, "master.m3u8");
  let masterPlaylist = "#EXTM3U\n#EXT-X-VERSION:3\n";

  // Transcode each resolution
  const promises = resolutions.map(async (resolution) => {
    const resolutionDir = path.join(outputDir, resolution.name);
    await fs.mkdir(resolutionDir, { recursive: true });

    const playlistPath = path.join(resolutionDir, "playlist.m3u8");

    const ffmpegArgs = [
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-b:v",
      resolution.bitrate,
      "-s",
      `${resolution.width}x${resolution.height}`,
      "-hls_time",
      "10",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      path.join(resolutionDir, "segment_%03d.ts"),
      "-f",
      "hls",
      playlistPath,
    ];

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", ffmpegArgs);

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          // Add to master playlist
          masterPlaylist += `#EXT-X-STREAM-INF:BANDWIDTH=${
            parseInt(resolution.bitrate) * 1000
          },RESOLUTION=${resolution.width}x${resolution.height}\n`;
          masterPlaylist += `${resolution.name}/playlist.m3u8\n`;
          resolve();
        } else {
          reject(
            new Error(`FFmpeg failed for ${resolution.name} with code ${code}`)
          );
        }
      });

      ffmpeg.on("error", (error) => {
        reject(
          new Error(
            `Failed to start FFmpeg for ${resolution.name}: ${error.message}`
          )
        );
      });
    });
  });

  // Wait for all resolutions to complete
  await Promise.all(promises);

  // Write master playlist
  await fs.writeFile(masterPlaylistPath, masterPlaylist);
}

// Start the process
init();
