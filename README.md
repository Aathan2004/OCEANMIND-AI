# OceanMind AI

OceanMind AI — Marine Intelligence Platform

Objective

Build a modern, futuristic, responsive web application that helps marine researchers, fishermen, students, and ocean enthusiasts identify fish species, analyze ocean conditions, and interact with an AI marine research assistant.

The UI should feel like a premium SaaS application with smooth animations, glassmorphism, ocean-themed colors, and professional dashboards.

Technology Stack

 React.js

 TypeScript

 Tailwind CSS

 Framer Motion

 React Router

 React Query

 Recharts

 Lucide React Icons

 Leaflet / Mapbox for maps

 shadcn/ui components

Design must be mobile responsive.

Color Theme

Primary Colors

Deep Ocean Blue (#003B73)

Ocean Cyan (#00A8E8)

Teal (#00BFA6)

Sea Green (#2ECC71)

White (#F9FAFB)

Background

Dark navy gradient

Glass cards

Blur effects

Soft shadows

Rounded corners

Gradient buttons

Animated waves in hero section

Landing Page

Hero Section

Large headline

"AI-Powered Ocean Intelligence Platform"

Subtitle

Identify Fish Species, Explore Ocean Conditions, and Research Marine Ecosystems with Artificial Intelligence.

Buttons

 Upload Fish

 Explore Ocean

 Talk with Ocean AI

Hero illustration

3D globe

Animated ocean

Swimming fishes

Floating particles

Statistics Section

Cards showing

 Fish Species Supported

 Ocean Regions

 AI Accuracy

 Research Articles

Feature Cards

Fish Recognition

Ocean Dashboard

Marine AI Assistant

Research Database

Satellite Ocean Maps

Species Analytics

Navigation Bar

Logo

OceanMind AI

Menu

 Home

 Fish Identification

 Ocean Dashboard

 Marine AI

 Research

 About

Right Side

Dark Mode Toggle

Profile

Notifications

Fish Identification Module

Beautiful upload interface

Drag & Drop

Upload Image button

Camera Capture

Supported formats

jpg

png

jpeg

When image uploads

Show loading animation

Scanning fish...

Identifying species...

Analyzing morphology...

After prediction

Split Layout

Left

Uploaded image

Zoom

Compare Image

Download Report

Right

Fish Information Card

Scientific Name

Common Name

Family

Habitat

Diet

Average Lifespan

Average Size

Danger Level

Commercial Value

IUCN Status

Geographical Distribution

Reproduction

Migration Pattern

Behavior

Nutritional Information

Fishing Season

Predators

Interesting Facts

Confidence Score

97.4%

Species Comparison

Similar fishes

Probability bars

Image Gallery

Habitat Images

Skeleton

Distribution map

Ocean Conditions Dashboard

Professional dashboard

Top Controls

Latitude

Longitude

Search Ocean Region

Date Picker

Live Toggle

Metrics Cards

Sea Surface Temperature

Salinity

Ocean Depth

Wave Height

Current Speed

Wind Speed

Visibility

Chlorophyll

Dissolved Oxygen

Pressure

Interactive World Map

Click any ocean

Display conditions

Charts

Temperature Trend

Salinity Graph

Wave Height

Current Speed

Forecast

24 Hours

7 Days

30 Days

Ocean Alerts

Storm

Cyclone

High Waves

Unsafe Fishing

Safe Zone Indicator

Fish Habitat Prediction

Map

Probability Heatmap

Suitable Habitat

Migration Direction

Season Prediction

Temperature Suitability

Ocean Research Assistant

ChatGPT-style interface

Large chat area

Sidebar

Recent Chats

Pinned Research

Saved Notes

Suggested Questions

Main Chat

User Bubble

AI Bubble

Typing animation

Markdown support

Tables

Code blocks

Research references

Example Prompts

Explain El Niño.

How do coral reefs respond to climate change?

What fish species live near 20°C waters?

How do ocean currents affect tuna migration?

What causes red tides?

Can sharks survive in freshwater?

Top Actions

Voice Input

Upload PDF

Upload Ocean Data

Upload Research Papers

Copy Response

Download PDF

Share

Marine Research Library

Search bar

Filters

Species

Location

Climate

Ecosystem

Research Cards

Title

Authors

Summary

Published Date

Ocean Region

Bookmark

Analytics Dashboard

Charts

Fish Identification History

Most Identified Species

Ocean Temperature Trends

Species Distribution

Research Activity

Pie Charts

Area Charts

Line Charts

Heatmaps

User Dashboard

Profile

Saved Fish

Saved Research

Downloads

Bookmarks

Recent Uploads

Statistics

Settings

Language

Theme

Notifications

API Keys

Location Settings

Measurement Units

Footer

About

Privacy

Terms

API

Contact

GitHub

Documentation

Social Links

Animations

Smooth page transitions

Glass hover effects

Card lift animation

Fish swimming background

Ocean wave animation

Gradient loading

Skeleton loading

AI typing indicator

Parallax hero

Map zoom animation

Floating bubbles

Responsive Design

Desktop

Tablet

Mobile

Collapsible sidebar

Bottom navigation on mobile

Touch-friendly controls

Additional AI Features

Fish Disease Detection

Upload fish image

Detect diseases

Suggest treatments

Fish Freshness Analyzer

Estimate freshness

Spoilage indicators

Quality grade

AI Recommendation Engine

Suggest

Best fishing locations

Similar species

Marine articles

Ocean alerts

Ocean Forecast

Predict

Wave conditions

Temperature

Currents

Fishing suitability

Marine Conservation

Protected species alerts

Illegal fishing warnings

Endangered fish information

Sustainability score

Export Options

Download

PDF report

CSV

Excel

Image summary

Overall UI Style

The application should resemble a premium AI SaaS product similar to ChatGPT, Notion AI, and Vercel Dashboard, combined with the visual quality of Apple and Stripe. Use a clean glassmorphism design with animated ocean-inspired backgrounds, smooth transitions, rich data visualizations, and highly polished, responsive layouts. The experience should feel modern, intuitive, and suitable for professional marine researchers as well as everyday users.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4fd61893-f05b-41d1-bcb4-305546296db9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Running the project

OceanMind AI has two processes: the Python service (ML + authentication + database)
and the TanStack Start frontend. Both must be running.

### 1. Install dependencies

```sh
# Frontend
npm install

# Python service
cd ml-py
python3 -m venv venv && source venv/bin/activate     # optional but recommended
pip install -r requirements.txt
```

### 2. Configure environment

```sh
# Frontend — from the repository root
cp .env.example .env

# Python service
cd ml-py
cp .env.example .env
# JWT_SECRET is REQUIRED; the service refuses to issue tokens without it:
python -c "import secrets; print('JWT_SECRET=' + secrets.token_urlsafe(48))" >> .env
```

### 3. Start the backend

```sh
cd ml-py
uvicorn app.main:app --reload --port 8000
```

Health check (never requires authentication):

```sh
curl http://127.0.0.1:8000/health
```

Interactive API docs: <http://127.0.0.1:8000/docs>

### 4. Start the frontend

```sh
npm run dev      # http://localhost:5173
```

## Machine learning

The classifier is an EfficientNet-B0 fine-tuned on fish photographs harvested
from GBIF occurrence records. Species facts are **not** stored in the repo —
they are fetched live from the GBIF and WoRMS APIs and cached in memory.

### Rebuild the dataset

```sh
cd ml-py

# How many labelled images GBIF has per species (downloads nothing)
python training/build_dataset_gbif.py --survey

# Download images for every species above the threshold
python training/build_dataset_gbif.py --download --min-images 100 --max-images 160
```

### Train

```sh
cd ml-py
python training/prepare_dataset.py    # deterministic, leakage-free splits
python training/train.py              # two-phase fine-tune + temperature calibration
```

Useful overrides: `EPOCHS`, `BATCH_SIZE`, `WARMUP_EPOCHS`, `CLASSIFIER_LR`,
`BACKBONE_LR`, `TORCH_DEVICE` (`cpu` / `cuda` / `mps`).

### Evaluate

```sh
cd ml-py
python training/evaluate.py           # writes models/evaluation_report.json
python training/analyze_dataset.py    # dataset health: duplicates, leakage, imbalance
```

`evaluate.py` reports top-1/3/5 accuracy, macro and weighted F1, the confusion
matrix, the most-confused species pairs, and what the live rejection thresholds
do to the held-out split.

## API

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | public | model + database health |
| POST | `/auth/register` | public | create an account |
| POST | `/auth/login` | public | obtain an access token |
| POST | `/auth/logout` | bearer | revoke the current token |
| GET | `/auth/me` | bearer | current user |
| POST | `/predict` | public | raw species prediction |
| POST | `/predict-full` | optional | prediction + GBIF/WoRMS species profile |
| POST | `/gradcam` | public | Grad-CAM attention map (PNG) |
| GET | `/fish/history` | bearer | the caller's own identifications |
| DELETE | `/fish/history` | bearer | clear the caller's history |

Identification returns one of three statuses, and the UI renders each
differently:

- `identified` — a confident species call, with taxonomy and biology from GBIF/WoRMS
- `unknown` — a fish the model cannot name confidently (no biology is invented)
- `not_fish` — the image does not contain a fish at all

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
