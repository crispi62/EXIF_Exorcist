EXIF Exorcist
Because your photos have ghosts, and they need to be properly cataloged.

A cynical little Obsidian plugin for ripping the metadata out of your images and slapping it into a note, whether it wants to or not.

What Fresh Hell is This?
You take pictures. Those pictures are full of secrets whispered by your camera: when it was taken, where it was, what lens was used, and sometimes, even your own desperate captions. Normally, this data stays locked away, a digital ghost in the machine.

The EXIF Exorcist performs a digital séance. It communicates with your image files, coerces them into giving up their secrets, and then creates a tidy Markdown note to document the confession. It's less of a gentle query and more of an interrogation.

This project was born from a simple need and then spiraled into a multi-day debugging odyssey, co-piloted by a human developer and their slightly-too-enthusiastic AI partner, Gemini Code Assist. What started as a simple script became a testament to stubbornness and the refusal to accept that accessing a simple text comment could be so complicated.

Features (Or, "What it Actually Does")
Automatic Haunting: Drops a new JPG or JPEG into the 99_Attachments/Pictures/Daily/ folder (or any of its sub-folders), and the Exorcist will automatically sense its presence and perform the ritual.
Manual Exorcism: Don't trust automation? Fine. Click the ribbon icon while an image is open to force the process. Your impatience is noted.
Creates a Sidecar Note: For every exorcised image, a corresponding .md file is created, because what's one more file in your vault, really?
Structured Confessions: The extracted data isn't just dumped. It's meticulously organized into a YAML frontmatter block, because even chaos needs order.
A Pretty Shrine: The generated note is formatted to be... well, prettier than you'd expect. It includes:
A centered title.
The image itself, tastefully centered with a border and scaled down to 75% so it doesn't scream at you.
A [!NOTE] Comment callout block for the image's primary caption, so its story can be told.
A "Details" section for the truly obsessive, listing camera model, creation date, and dimensions.
The Extracted Secrets
The Exorcist is relentless. It will search the following fields for a story to tell, in this exact order of priority:

IPTC:Caption/Abstract (The professional choice)
XMP:UserComment (The one that finally worked after hours of debugging)
XMP:Description (A reasonable guess)
EXIF:ImageDescription (An old classic)
EXIF:UserComment (The last resort)
It also extracts the following for your YAML frontmatter, for maximum data hoarding:

creation_date & modified_date
file_type, image_height, image_width
camera_model
gps_latitude & gps_longitude
tags
...and a few other static properties for good measure.
The Authors
Crispi: The human who started this mess.
Gemini Code Assist: The digital brain that, after a good night's sleep, finally figured out how to access that one specific comment field.
This plugin is proof that with enough persistence, caffeine, and AI-powered suggestions, you can solve any problem you've arbitrarily created for yourself.
