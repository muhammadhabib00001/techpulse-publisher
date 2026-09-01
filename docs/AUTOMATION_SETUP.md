# Automated Content Pipeline Setup Guide
## Google Cloud Vertex AI + Google Drive API + GitHub Actions

This automated publishing pipeline uses **Google Cloud Vertex AI (Gemini)** to generate high-substance, 1,000–1,500+ word engineering articles and **Google Drive API** to fetch topic briefs and archive published articles.

---

## Architecture Flow
1. **Trigger**: Runs automatically via GitHub Actions on a cron schedule (Tuesdays & Fridays at 08:00 UTC) or manually via `workflow_dispatch`.
2. **Google Drive Intake**: Checks a designated Google Drive folder for text topic briefs.
3. **Vertex AI Synthesis**: Generates an authoritative technical article adhering to 2026 Google Search, EEAT, and AdSense standards.
4. **Site Auto-Index**: Formats semantic HTML, creates JSON-LD structured schemas, and updates `sitemap.xml`.
5. **Google Drive Backup**: Archives the final HTML article into Google Drive.
6. **Git Auto-Commit**: Automatically commits and pushes changes to the `main` branch.

---

## Step 1: Create a Google Cloud Service Account

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new GCP project or select an existing one (e.g., `techpulse-production`).
3. Enable the required APIs:
   - **Vertex AI API**
   - **Google Drive API**
4. Navigate to **IAM & Admin &rarr; Service Accounts** and click **Create Service Account**.
5. Assign the following roles:
   - **Vertex AI User** (`roles/aiplatform.user`)
6. Go to the **Keys** tab of your service account, click **Add Key &rarr; Create new key &rarr; JSON**.
7. Download the JSON key file.

---

## Step 2: Configure Google Drive Folder

1. In Google Drive, create a new folder named `TechPulse Editorial Queue`.
2. Open the folder and copy its **Folder ID** from the URL:
   `https://drive.google.com/drive/folders/<FOLDER_ID>`
3. Click **Share** on the folder, and share it with the service account email (e.g., `publisher@techpulse-production.iam.gserviceaccount.com`) with **Editor** permissions.

---

## Step 3: Configure GitHub Repository Secrets

In your GitHub repository (`https://github.com/muhammadhabib00001/techpulse-publisher`), go to **Settings &rarr; Secrets and variables &rarr; Actions &rarr; New repository secret** and add:

| Secret Name | Description / Value |
| :--- | :--- |
| `GCP_CREDENTIALS_JSON` | Entire contents of the downloaded service account JSON key file |
| `GCP_PROJECT_ID` | Your Google Cloud Project ID (e.g., `techpulse-production`) |
| `GCP_REGION` | GCP Region for Vertex AI (e.g., `us-central1`) |
| `GOOGLE_DRIVE_FOLDER_ID` | The ID of your shared Google Drive folder |

---

## Step 4: Testing the Workflow

### Manual Trigger:
1. In your GitHub repository, navigate to the **Actions** tab.
2. Select **Automated Article Publishing Pipeline (Vertex AI + Google Drive)**.
3. Click **Run workflow**, optionally inputting a custom topic.
4. The pipeline will generate the article, update `sitemap.xml`, back up to Google Drive, and commit directly to `main`.
