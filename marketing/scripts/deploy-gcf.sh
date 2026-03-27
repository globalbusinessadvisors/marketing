#!/usr/bin/env bash
# Deploy all marketing swarm agents as Google Cloud Functions (2nd gen)
# Usage: ./scripts/deploy-gcf.sh [--region REGION] [--project PROJECT]

set -euo pipefail

REGION="${REGION:-us-central1}"
PROJECT="${PROJECT:-nicholas-ruest-com}"
RUNTIME="nodejs20"
MEMORY="512MB"
TIMEOUT="120s"
MIN_INSTANCES="0"
MAX_INSTANCES="5"
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --memory) MEMORY="$2"; shift 2 ;;
    --max-instances) MAX_INSTANCES="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "=== AI Marketing Swarm - Cloud Functions Deployment ==="
echo "Project:  $PROJECT"
echo "Region:   $REGION"
echo "Runtime:  $RUNTIME"
echo "Memory:   $MEMORY"
echo "Source:   $SOURCE_DIR"
echo ""

# Build first
echo "[1/3] Building TypeScript..."
cd "$SOURCE_DIR"
npm run build

echo ""
echo "[2/3] Deploying Cloud Functions..."

# Function definitions: name -> entry-point
declare -A FUNCTIONS=(
  # Gateway & Health
  ["marketing-gateway"]="gateway"
  ["marketing-health"]="health"
  # Tier 1: Core Coordination
  ["marketing-orchestrator"]="orchestrator"
  ["marketing-memory"]="memory"
  ["marketing-quality"]="quality"
  # Tier 2: Intelligence
  ["marketing-simulation"]="simulation"
  ["marketing-historical-memory"]="historicalMemory"
  ["marketing-risk-detection"]="riskDetection"
  ["marketing-attention-arbitrage"]="attentionArbitrage"
  # Tier 3: Creative
  ["marketing-creative-genome"]="creativeGenome"
  ["marketing-fatigue-forecaster"]="fatigueForecaster"
  ["marketing-mutation"]="mutation"
  # Tier 4: Attribution
  ["marketing-counterfactual"]="counterfactual"
  ["marketing-causal-graph"]="causalGraph"
  ["marketing-incrementality"]="incrementality"
  # Tier 5: Operations
  ["marketing-account-health"]="accountHealth"
  ["marketing-cross-platform"]="crossPlatform"
)

DEPLOYED=0
FAILED=0

for FUNC_NAME in "${!FUNCTIONS[@]}"; do
  ENTRY_POINT="${FUNCTIONS[$FUNC_NAME]}"
  echo ""
  echo "  Deploying: $FUNC_NAME (entry: $ENTRY_POINT)..."

  if gcloud functions deploy "$FUNC_NAME" \
    --gen2 \
    --region="$REGION" \
    --project="$PROJECT" \
    --runtime="$RUNTIME" \
    --trigger-http \
    --allow-unauthenticated \
    --entry-point="$ENTRY_POINT" \
    --source="$SOURCE_DIR" \
    --memory="$MEMORY" \
    --timeout="$TIMEOUT" \
    --min-instances="$MIN_INSTANCES" \
    --max-instances="$MAX_INSTANCES" \
    --set-env-vars="NODE_ENV=production" \
    2>&1; then
    DEPLOYED=$((DEPLOYED + 1))
    echo "  [OK] $FUNC_NAME deployed"
  else
    FAILED=$((FAILED + 1))
    echo "  [FAIL] $FUNC_NAME failed"
  fi
done

echo ""
echo "[3/3] Deployment Summary"
echo "========================"
echo "Deployed: $DEPLOYED"
echo "Failed:   $FAILED"
echo "Total:    ${#FUNCTIONS[@]}"
echo ""

# List deployed functions
echo "Deployed Function URLs:"
gcloud functions list --project="$PROJECT" --region="$REGION" --format="table(name,state,url)" 2>/dev/null || true

echo ""
echo "Done! Gateway URL:"
echo "  https://$REGION-$PROJECT.cloudfunctions.net/marketing-gateway"
