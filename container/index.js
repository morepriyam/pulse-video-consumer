const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const dotenv = require("dotenv");
const path = require("node:path");
const fs = require("node:fs/promises");
const { spawn } = require("child_process");

dotenv.config();

const BUCKET = process.env.BUCKET_NAME;
const KEY = process.env.KEY;
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET_NAME || BUCKET;

async function init() {
    console.log("Starting video transcoding process...");
    console.log(`Input: s3://${BUCKET}/${KEY}`);
    
    try {
        // Initialize S3 client
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
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
        await fs.resolve(originalFilePath, response.Body);
        console.log("Video downloaded successfully");

        // Transcode to HLS
        console.log("Starting HLS transcoding...");

     
        
        console.log("Transcoding completed successfully!");
        
    } catch (error) {
        console.error("Error during transcoding:", error);

        process.exit(1);
    }
}


// Start the process
init();
