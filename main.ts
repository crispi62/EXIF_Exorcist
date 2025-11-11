import { App, MarkdownView, Plugin, TFile, Notice, TAbstractFile } from 'obsidian';
// Import the exifreader library
import * as ExifReader from 'exifreader';

export default class EXIFExorcistPlugin extends Plugin {

    readonly PLUGIN_VERSION = 'DEBUG-V3';

    async onload() {
        console.log('EXIF Exorcist: Loading (Direct-Read Mode)...');

        this.addRibbonIcon('image-file', 'EXIF Exorcist: Read Metadata', async () => {
            
            const activeFile = this.app.workspace.getActiveFile();
            
            // 1. Check if we have a valid file
            if (!activeFile || (activeFile.extension !== 'jpg' && activeFile.extension !== 'jpeg')) {
                console.log("EXIF Exorcist: No JPG/JPEG file is currently active.");
                new Notice("EXIF Exorcist: Please select a JPG or JPEG image file.");
                return;
            }

            try {
                await this.processImage(activeFile);

            } catch (error) {
                console.error("EXIF Exorcist: FAILED to read or parse EXIF data.");
                console.error(error);
                new Notice("EXIF Exorcist: Failed to parse EXIF data. See console for details.");
            }
        });

        // --- Automatic Folder Watching ---
        this.registerEvent(this.app.vault.on('create', async (file: TAbstractFile) => {
            // 1. Check if it's a file and not a folder
            if (!(file instanceof TFile)) {
                return;
            }

            // 2. Check if it's a JPG/JPEG file
            if (file.extension !== 'jpg' && file.extension !== 'jpeg') {
                return;
            }

            // 3. Check if it's in the target folder
            const targetFolder = '99_Attachments/Pictures/Daily/';
            if (!file.path.startsWith(targetFolder)) {
                return;
            }

            console.log(`EXIF Exorcist: Detected new image in target folder: ${file.path}`);
            // Wait a moment to ensure the file is fully written to disk before processing
            await sleep(500);

            // Process the newly created image file
            await this.processImage(file);
        }));
    }

    async processImage(imageFile: TFile) {
        console.log(`EXIF Exorcist: Found active file: ${imageFile.path}`);

        const notePath = imageFile.path.replace(/\.(jpe?g)$/i, '.md');
        if (await this.app.vault.adapter.exists(notePath)) {
            new Notice(`Sidecar note already exists at ${notePath}. Aborting.`);
            console.log(`EXIF Exorcist: Sidecar note already exists at ${notePath}. Aborting.`);
            return;
        }

        new Notice(`[EXIF Exorcist v${this.PLUGIN_VERSION}] Step 1: Reading ${imageFile.name}`);
        console.log("EXIF Exorcist: Reading file buffer...");
        const fileData = await this.app.vault.readBinary(imageFile);

        console.log("EXIF Exorcist: Parsing EXIF data...");
        const tags = ExifReader.load(fileData, { expanded: true });
        console.log("EXIF Exorcist: --- DEBUG: All Found Tags ---");
        console.log(tags);

        const metadata: { [key: string]: any } = {
            title: imageFile.basename,
            // Add static fields
            type: 'image',
            icon: '🖼️'
        };
        metadata.place = ""; // Add empty place property
        const userCommentText = this.extractComment(tags);

        if ((tags.xmp as any)?.subject?.description) {
            metadata.tags = (tags.xmp as any).subject.description;
        }

        if (tags.gps?.Latitude && tags.gps?.Longitude) {
            metadata.gpsLatitude = tags.gps.Latitude;
            metadata.gpsLongitude = tags.gps.Longitude;
        }

        if ((tags.exif as any)?.DateTimeOriginal?.description) {
            const originalDate = (tags.exif as any).DateTimeOriginal.description;
            metadata.creation_date = originalDate.substring(0, 10).replace(/:/g, '-') + originalDate.substring(10);
        }
        if ((tags.exif as any)?.DateTime?.description) {
            const modifyDate = (tags.exif as any).DateTime.description;
            metadata.modified_date = modifyDate.substring(0, 10).replace(/:/g, '-') + modifyDate.substring(10);
        }

        // --- Add new fields as requested ---

        // Camera Model
        if ((tags.exif as any)?.Model?.description) {
            metadata.camera_model = (tags.exif as any).Model.description;
        }

        // File Type, Height, and Width from the 'file' group
        if ((tags.file as any)?.FileType?.value) {
            metadata.file_type = (tags.file as any).FileType.value;
        }
        if ((tags.file as any)?.['Image Height']?.description) {
            metadata.image_height = (tags.file as any)['Image Height'].description;
        }
        if ((tags.file as any)?.['Image Width']?.description) {
            metadata.image_width = (tags.file as any)['Image Width'].description;
        }
        metadata.image_description = (tags.exif as any)?.ImageDescription?.description || "";
        

        // Log all the extracted metadata to the console
        console.log("EXIF Exorcist: --- Extracted Metadata Summary ---");
        console.log(`Comment/Caption: ${userCommentText || 'Not found'}`);
        for (const key in metadata) {
            if (Object.prototype.hasOwnProperty.call(metadata, key)) {
                console.log(`YAML -> ${key}: ${metadata[key]}`);
            }
        }
        console.log("EXIF Exorcist: ------------------------------------");

        console.log(`EXIF Exorcist: --- SUCCESS ---`);
        await this.createSidecarNote(imageFile, metadata, userCommentText);
    }

    extractComment(tags: ExifReader.ExpandedTags): string {
        const searchFields = [
            { name: "IPTC:Caption/Abstract", value: (tags.iptc as any)?.['Caption/Abstract']?.description },
            { name: "XMP:UserComment", value: (tags.xmp as any)?.UserComment?.description },
            { name: "XMP:Description", value: (tags.xmp as any)?.description?.description },
            { name: "EXIF:ImageDescription", value: (tags.exif as any)?.ImageDescription?.description },
        ];

        for (const field of searchFields) {
            if (field.value && typeof field.value === 'string' && field.value.trim() !== '') {
                new Notice(`[EXIF Exorcist v${this.PLUGIN_VERSION}] Found text in ${field.name}!`);
                console.log(`EXIF Exorcist: Found text in ${field.name}: "${field.value}"`);
                return field.value;
            }
        }

        const userCommentValue = (tags.exif as any)?.UserComment?.value;
        if (Array.isArray(userCommentValue) && userCommentValue.length > 8) {
            const commentBytes = userCommentValue.slice(8);
            const decodedComment = String.fromCharCode(...commentBytes).replace(/\0+$/, '').trim();
            if (decodedComment) {
                new Notice(`[EXIF Exorcist v${this.PLUGIN_VERSION}] Found text in EXIF:UserComment!`);
                console.log(`EXIF Exorcist: Found text in EXIF:UserComment: "${decodedComment}"`);
                return decodedComment;
            }
        }

        new Notice(`[EXIF Exorcist v${this.PLUGIN_VERSION}] No caption or comment found.`);
        return "";
    }

    async createSidecarNote(imageFile: TFile, metadata: { [key: string]: any }, comment: string) {
        const imagePath = imageFile.path;
        const notePath = imagePath.replace(/\.(jpe?g)$/i, '.md');
        let yaml = '---\n';

        // Define the exact order for YAML properties
        const yamlOrder = [
            'creation_date', 'modified_date', 'type', 'icon', 'file_type', 
            'image_height', 'image_width', 'camera_model', 'gps_latitude', 
            'gps_longitude', 'place', 'image_description', 'tags'
        ];

        // Helper to format a YAML line
        const formatYamlLine = (key: string, value: any) => {
            if (value === undefined || value === null) return '';
            if (typeof value === 'string') {
                // Wrap strings in quotes and escape existing quotes
                return `${key}: "${String(value).replace(/"/g, '\\"')}"\n`;
            }
            return `${key}: ${value}\n`;
        };

        // Add the static image link first
        yaml += `image: "[[${imageFile.name}]]"\n`;

        // Add properties in the specified order
        for (const key of yamlOrder) {
            // Remap gpsLatitude/Longitude to gps_latitude/longitude for YAML
            if (key === 'gps_latitude' && metadata.gpsLatitude) yaml += formatYamlLine('gps_latitude', metadata.gpsLatitude);
            else if (key === 'gps_longitude' && metadata.gpsLongitude) yaml += formatYamlLine('gps_longitude', metadata.gpsLongitude);
            else if (metadata[key] !== undefined) yaml += formatYamlLine(key, metadata[key]);
        }

        yaml += '---\n';

        // --- Build the note body ---

        // 1. Start with the YAML frontmatter and a title
        let noteContent = `${yaml}
<div style="text-align: center;"><h1>${metadata.title}</h1></div>

`;

        // 2. Embed the image
        const imageSrc = this.app.vault.adapter.getResourcePath(imageFile.path);
        noteContent += `<img src="${imageSrc}" width="75%" style="display: block; margin-left: auto; margin-right: auto; border: 1px solid black;">\n\n`;

        // 3. Add the comment/caption inside a callout block, if it exists
        if (comment) {
            noteContent += `> [!NOTE] Comment\n`;
            noteContent += `> ${comment.replace(/\n/g, '\n> ')}\n\n`; // Ensure multi-line comments are quoted
            console.log(`EXIF Exorcist: Appending text to note.`);
        }

        // 4. Add a "Details" section with other key metadata
        noteContent += '---\n\n';
        noteContent += '## Details\n';
        if (metadata.camera_model) noteContent += `- **Camera**: ${metadata.camera_model}\n`;
        if (metadata.creation_date) noteContent += `- **Created**: ${metadata.creation_date}\n`;
        if (metadata.image_width && metadata.image_height) noteContent += `- **Dimensions**: ${metadata.image_width} x ${metadata.image_height}\n`;

        const newFile = await this.app.vault.create(notePath, noteContent);
        await this.app.workspace.getLeaf('tab').openFile(newFile);
        new Notice(`EXIF Exorcist: Created sidecar note at ${notePath}`);
    }

    onunload() {
        console.log('EXIF Exorcist: Unloading...');
    }
}
