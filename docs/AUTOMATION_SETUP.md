# Automated Content Pipeline Setup Guide
## Google AI Studio (Gemini) / Vertex AI + Google Drive API + GitHub Actions

This automated publishing pipeline uses **Gemini AI** to generate high-substance, 1,000–1,500+ word engineering articles and **Google Drive API** to fetch topic briefs and archive published articles.

---

## ⚡ Option 1: Fast & Easy Setup (Google AI Studio Key - Recommended)

If you don't have or see Vertex AI in Google Cloud, you can get a free Gemini API key in 30 seconds:

1. Go to **[Google AI Studio](https://aistudio.google.com/app/apikey)**.
2. Sign in with your Google account.
3. Click **Create API Key** &rarr; Copy your key.
4. Go to your GitHub repository: `https://github.com/muhammadhabib00001/techpulse-publisher`
5. Go to **Settings &rarr; Secrets and variables &rarr; Actions &rarr; New repository secret**:
   - Name: `GEMINI_API_KEY`
   - Value: *(Paste your Gemini API key)*

---

## 🏢 Option 2: Enterprise GCP Vertex AI Setup

If you prefer using full Google Cloud Platform Vertex AI:

1. Open **[Google Cloud Console](https://console.cloud.google.com/)**.
2. Make sure **Billing** is enabled on your GCP project.
3. In the top search bar, search for **Vertex AI** or direct URL: `https://console.cloud.google.com/vertex-ai`.
4. Click **ENABLE ALL RECOMMENDED APIS**.
5. Navigate to **IAM & Admin &rarr; Service Accounts** &rarr; **Create Service Account** &rarr; assign role **Vertex AI User**.
6. Create a **JSON Key** and download it.
7. Add the GitHub Secrets:
   - `GCP_CREDENTIALS_JSON` (Full JSON contents)
   - `GCP_PROJECT_ID` (Project ID)
   - `GCP_REGION` (`us-central1`)

---

## 📁 Google Drive Setup (Optional)

1. In Google Drive, create a folder named `TechPulse Editorial Queue`.
2. Copy the Folder ID from the URL (`https://drive.google.com/drive/folders/<FOLDER_ID>`).
3. Add the GitHub Secret:
   - `GOOGLE_DRIVE_FOLDER_ID`
