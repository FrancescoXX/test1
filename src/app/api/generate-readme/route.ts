// app/api/generate-readme/route.ts
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { NextRequest, NextResponse } from 'next/server';
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import fs from 'fs/promises'; // Use promises version of fs
import path from 'path';
import os from 'os';

const API_KEY = process.env.GOOGLE_API_KEY;

if (!API_KEY) {
    console.error("GOOGLE_API_KEY is not set in environment variables.");
}
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  // Add others if needed
];

const MAX_FILE_READ_SIZE_BYTES = 50 * 1024; // Limit file read size (e.g., 50KB)
const MAX_TOTAL_CONTEXT_LENGTH = 15000; // Limit total characters sent to Gemini
const MAX_FILES_TO_LIST = 100; // Limit number of files listed
const MAX_FILE_CONTENT_TO_INCLUDE = 10; // Limit number of file contents included

// --- Helper function to recursively list files ---
async function listFiles(dir: string, fileList: string[] = [], rootDir: string, maxFiles: number): Promise<string[]> {
    if (fileList.length >= maxFiles) {
        return fileList;
    }
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
        const res = path.resolve(dir, dirent.name);
        // Basic check to ignore .git directory and node_modules
        if (dirent.name === '.git' || dirent.name === 'node_modules') {
            continue;
        }
        if (dirent.isDirectory()) {
            await listFiles(res, fileList, rootDir, maxFiles);
            if (fileList.length >= maxFiles) break; // Stop if max reached
        } else {
            // Store relative path
            fileList.push(path.relative(rootDir, res));
            if (fileList.length >= maxFiles) break; // Stop if max reached
        }
    }
    return fileList;
}

// --- Main POST Handler ---
export async function POST(request: NextRequest) {
    if (!genAI) {
        return NextResponse.json({ error: "API Key not configured." }, { status: 500 });
    }

    let tempDir: string | null = null; // To store the path for cleanup

    try {
        const body = await request.json();
        const { repoUrl } = body;

        if (!repoUrl || typeof repoUrl !== 'string' || (!repoUrl.startsWith('http://') && !repoUrl.startsWith('https://'))) {
            return NextResponse.json({ error: "Invalid repository URL provided." }, { status: 400 });
        }

        // 1. Create Temporary Directory
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-readme-'));
        console.log(`Created temporary directory: ${tempDir}`);

        // 2. Clone Repository
        console.log(`Cloning ${repoUrl} into ${tempDir}...`);
        const gitOptions: Partial<SimpleGitOptions> = {
            baseDir: tempDir,
            binary: 'git',
            maxConcurrentProcesses: 6,
        };
        const git: SimpleGit = simpleGit(gitOptions);
        // Clone only the latest commit, no history needed
        await git.clone(repoUrl, '.', ['--depth=1']); // Clone into the temp dir itself
        console.log("Repository cloned successfully.");

        // 3. Extract Information
        console.log("Extracting repository information...");
        let extractedContext = "Repository Structure and Key Files:\n\n";
        let totalContextLength = extractedContext.length;

        // Get file list (limited)
        const allFiles = await listFiles(tempDir, [], tempDir, MAX_FILES_TO_LIST);
        extractedContext += `File List (${Math.min(allFiles.length, MAX_FILES_TO_LIST)} files shown):\n`;
        allFiles.slice(0, MAX_FILES_TO_LIST).forEach(f => {
            const line = `- ${f}\n`;
            if (totalContextLength + line.length < MAX_TOTAL_CONTEXT_LENGTH) {
                extractedContext += line;
                totalContextLength += line.length;
            }
        });
        if(allFiles.length > MAX_FILES_TO_LIST) {
             extractedContext += `- ... (and ${allFiles.length - MAX_FILES_TO_LIST} more files)\n`;
        }
        extractedContext += "\n";

        // Identify and read key files (limited number and size)
        const keyFiles = [
            'package.json', 'composer.json', 'requirements.txt', 'Pipfile', 'Gemfile',
            'pom.xml', 'build.gradle', 'Makefile', 'Dockerfile', 'docker-compose.yml',
            'README', 'README.md', 'README.rst', // Include existing README for context, maybe
            // Add likely entry points or main config files if identifiable by name pattern
            // e.g., 'src/index.js', 'app/main.py', 'config/app.php'
            // Be selective!
        ];

        let filesReadCount = 0;
        extractedContext += "Key File Contents:\n";
        for (const potentialFileRelPath of keyFiles) {
             if (filesReadCount >= MAX_FILE_CONTENT_TO_INCLUDE) break;

             // Find the actual file path (case-insensitive check might be needed)
             const actualFileRelPath = allFiles.find(f => f.toLowerCase().endsWith(potentialFileRelPath.toLowerCase()));

             if (actualFileRelPath) {
                const filePath = path.join(tempDir, actualFileRelPath);
                try {
                    const stats = await fs.stat(filePath);
                    if (stats.isFile() && stats.size <= MAX_FILE_READ_SIZE_BYTES) {
                        const content = await fs.readFile(filePath, 'utf-8');
                        const section = `\n--- File: ${actualFileRelPath} ---\n${content.slice(0, MAX_TOTAL_CONTEXT_LENGTH - totalContextLength - 100)}\n---\n`; // Limit content slice

                         if (totalContextLength + section.length < MAX_TOTAL_CONTEXT_LENGTH) {
                            extractedContext += section;
                            totalContextLength += section.length;
                            filesReadCount++;
                        } else {
                             // Stop adding file content if context limit is near
                             break;
                         }
                    }
                } catch (readError: any) {
                    console.warn(`Could not read file ${actualFileRelPath}: ${readError.message}`);
                }
            }
        }
         if (filesReadCount === 0) {
             extractedContext += "(No key files identified or read)\n";
         }
        console.log(`Extracted context length: ${totalContextLength} characters.`);

        // 4. Construct Prompt for Gemini
        const prompt = `
            Based *only* on the following extracted context from the public code repository at ${repoUrl}, generate a comprehensive README.md file in Markdown format.

            **Extracted Context:**
            \`\`\`
            ${extractedContext}
            \`\`\`

            **Instructions for README Generation:**
            1.  **Infer Purpose:** Based on file names (like package.json, requirements.txt) and any file content provided, infer the project's likely purpose and primary language/framework.
            2.  **Structure:** Create a standard README with sections like:
                * Project Title (Infer a good one)
                * Description (Brief overview based on inference)
                * Tech Stack (List inferred technologies)
                * Getting Started (Provide generic steps based on package managers identified, e.g., 'npm install', 'pip install -r requirements.txt'. Mention cloning the repo.)
                * Usage (If possible, infer basic usage, otherwise provide a placeholder)
                * File Structure Overview (Briefly mention key directories if apparent from the file list)
                * Contributing (Generic placeholder)
                * License (Generic placeholder like MIT unless a LICENSE file was read)
            3.  **Content Source:** Generate content *strictly* from the provided context. Do not add features, instructions, or technologies not mentioned or strongly implied by the context. If context is insufficient for a section, state that or use a placeholder.
            4.  **Formatting:** Use standard Markdown. Format code commands correctly.
            5.  **Conciseness:** Be informative but avoid excessive jargon.
        `;

        // 5. Call Gemini API
        console.log("Sending prompt to Gemini...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", safetySettings }); // Use a capable model
        const generationResult = await model.generateContent(prompt);
        const response = generationResult.response;
        console.log("Received response from Gemini.");

        // 6. Process Response
         if (response && response.candidates && response.candidates.length > 0 && response.text) {
             const readmeText = response.text();
            return NextResponse.json({ readme: readmeText });
        } else {
             console.error("Gemini response invalid or blocked:", response);
             const feedback = response?.promptFeedback;
             const finishReason = response?.candidates?.[0]?.finishReason;
             return NextResponse.json({ error: `Failed to generate content. Reason: ${finishReason || 'Unknown'}. Feedback: ${JSON.stringify(feedback)}` }, { status: 500 });
        }

    } catch (error: any) {
        console.error("Error in /api/generate-readme:", error);
        // Provide more specific errors if possible
        let errorMessage = "An internal server error occurred.";
        if (error.code === 'ENOENT' || error.message?.includes('Authentication failed')) { // Example git errors
             errorMessage = "Failed to clone repository. Check URL and ensure it's public.";
        } else if (error.message?.includes('mkdtemp')) {
             errorMessage = "Failed to create temporary directory on server.";
        } else if (error.message) {
             errorMessage = error.message; // Use error message if available
        }
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    } finally {
        // 7. Cleanup Temporary Directory
        if (tempDir) {
            console.log(`Cleaning up temporary directory: ${tempDir}`);
            await fs.rm(tempDir, { recursive: true, force: true }).catch(err => {
                console.error(`Failed to remove temporary directory ${tempDir}: ${err}`);
            });
        }
    }
}

// Optional: Add GET handler
export async function GET() {
    return NextResponse.json({ message: "Send a POST request with a 'repoUrl' to generate a README." });
}