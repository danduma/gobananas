
# Go Bananas! Studio

High-quality image generation using the Nano Banana Pro or Nano Banana OG. Create stunning images with advanced AI technology from Google.

## 🛠️ Run Locally

**Prerequisites:** Node.js (v16 or higher)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/danduma/gobananas
   cd gobananas
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Set up your API key:**
   - In the app, click the "Change Key" button to enter your API key.

5. **Open your browser** and navigate to `http://localhost:3000` (or the port specified in the output of the previous command)

## 📖 Usage

1. **Select a save folder**: Select a folder to save your generated images to. Some system folders are not available for selection (e.g. Downloads, Desktop, etc.).
2. **Enter a prompt**: Describe the image you want to generate
3. **Configure settings**:
   - Choose aspect ratio
   - Select image size (1K, 2K, 4K)
   - Select the model you want to use
   - Adjust temperature for creativity
4. **Generate**: Click the button to create your image
5. **Gallery**: Your generated images are saved in the gallery and can be viewed there.

## 🎨 Supported Models
- Gemini 3 Pro Image Preview (latest and greatest)
- Gemini 2.5 Flash Image (older model)


## ✨ Features

- **High-Quality Generation**: Powered by Google's Gemini 3 Pro model
- **4K Resolution Support**: Generate images up to 4K resolution
- **Multiple Aspect Ratios**: Choose from various aspect ratios (1:1, 16:9, 4:3, etc.)
- **Temperature Control**: Adjust creativity level for your generations
- **Generation History**: Save and manage your generated images
- **Local Storage**: All generations stored locally on your device
- **Responsive Design**: Works seamlessly across desktop and mobile devices

## 🚀 Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **AI**: Google Gemini 3 Pro Image Generation API
- **Icons**: Lucide React
- **Styling**: Tailwind CSS (utility classes)


## 📄 License
See [LICENSE.md](LICENSE.md) for details.
