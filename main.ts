import { App, MarkdownView, Plugin, TFile, Notice, TAbstractFile, requestUrl } from 'obsidian';
// Import the exifreader library
import * as ExifReader from 'exifreader';
import { Moment } from 'moment';

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
            icon: '🖼️',
            stage: 'seedling'
        };
        const userCommentText = this.extractComment(tags);

        // --- Handle image_tags as a list ---
        const subject = (tags.xmp as any)?.subject?.description;
        if (subject) {
            if (Array.isArray(subject)) {
                metadata.image_tags = subject;
            } else if (typeof subject === 'string') {
                // Split comma-separated string into an array
                metadata.image_tags = subject.split(',').map(tag => tag.trim()).filter(tag => tag);
            }
        }

        // --- GPS and Reverse Geocoding Feature Leap ---
        if (tags.gps && tags.gps.Latitude && tags.gps.Longitude) {
            const placeName = await this.reverseGeocode(tags.gps.Latitude, tags.gps.Longitude);
            if (placeName) {
                metadata.place = `[[${placeName}]]`;
            }
        }

        const creationDateStr = (tags.exif as any)?.DateTimeOriginal?.description;
        if (creationDateStr) {
            metadata.creation_date = this.formatExifDate(creationDateStr);
        }
        const modifyDateStr = (tags.exif as any)?.DateTime?.description;
        if (modifyDateStr) {
            metadata.modified_date = this.formatExifDate(modifyDateStr);
        }

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

    async reverseGeocode(lat: number, lon: number): Promise<string | null> {
        console.log(`EXIF Exorcist: Performing reverse geocoding for ${lat}, ${lon}`);
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`;
            const response = await requestUrl({ url, method: 'GET' });

            if (response.status === 200) {
                const data = response.json;
                // Extract a meaningful place name, trying city, town, village, etc.
                const place = data.address.city || data.address.town || data.address.village || data.address.county || data.address.state;
                if (place) {
                    console.log(`EXIF Exorcist: Found place: ${place}`);
                    return place;
                }
            }
        } catch (error) {
            console.error("EXIF Exorcist: Reverse geocoding failed.");
            console.error(error);
            new Notice("Reverse geocoding failed. See console for details.");
        }

        console.log("EXIF Exorcist: Could not find a place name for the given coordinates.");
        return null;
    }

    formatExifDate(exifDate: string): string {
        // EXIF dates are 'YYYY:MM:DD HH:MM:SS'
        // We can use moment, which is available in Obsidian, for robust parsing
        const m = (window as any).moment(exifDate, 'YYYY:MM:DD HH:mm:ss');
        if (m.isValid()) {
            return m.format('DD-MM-YYYY');
        }
        return ''; // Return empty string if parsing fails
    }

    async createSidecarNote(imageFile: TFile, metadata: { [key: string]: any }, comment: string) {
        const imagePath = imageFile.path;
        const notePath = imagePath.replace(/\.(jpe?g)$/i, '.md');
        let yaml = '---\n';

        // Define the exact order for YAML properties
        const yamlOrder = [
            'creation_date', 'modified_date', 'type', 'icon', 'stage', 'place', 'image_tags'
        ];

        // Helper to format a YAML line
        const formatYamlLine = (key: string, value: any) => {
            if (value === undefined || value === null) return '';
            // This function is for simple key-value pairs, not nested objects.
            // Nested objects like 'gps' will be handled explicitly in the loop.
            if (key === 'image_tags' && Array.isArray(value)) {
                // Format as a YAML list: [tag1, tag2]
                return `image_tags: [${value.join(', ')}]\n`;
            }
            if (typeof value === 'string') {
                // Wrap strings in quotes and escape existing quotes
                return `${key}: "${String(value).replace(/"/g, '\\"')}"\n`;
            }
            return `${key}: ${value}\n`;
        };

        // Add the static image link first
        yaml += `image_file: "[[${imageFile.name}]]"\n`;

        // Add properties in the specified order
        for (const key of yamlOrder) {
            if (metadata[key] !== undefined) yaml += formatYamlLine(key, metadata[key]);
        }

        yaml += '---\n';

        // --- Build the note body ---

        // 1. Start with the YAML frontmatter
        let noteContent = `${yaml}`;

        // 2. Embed the image
        noteContent += `![[${imageFile.name}]]\n\n`;

        // 3. Add the extracted comment text directly to the note body, if it exists
        if (comment) {
            noteContent += `${comment}\n`;
            console.log(`EXIF Exorcist: Appending text to note.`);
        }

        const newFile = await this.app.vault.create(notePath, noteContent);
        await this.app.workspace.getLeaf('tab').openFile(newFile);
        new Notice(`EXIF Exorcist: Created sidecar note at ${notePath}`);
    }

    onunload() {
        console.log('EXIF Exorcist: Unloading...');
    }
}
